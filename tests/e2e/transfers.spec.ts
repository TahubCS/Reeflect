import { mkdir } from "node:fs/promises";
import {
  type Browser,
  type BrowserContext,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { Pool } from "pg";
import { hydrated, ownClientAddress, signUpVerified } from "./support";
let pool: Pool;
test.beforeAll(() => {
  pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgres://test:test@localhost:5433/app_test",
    max: 2,
  });
});
const contexts: BrowserContext[] = [],
  users: string[] = [],
  errors: string[] = [];
const expectedFailure = new WeakSet<Page>();
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const shift = (date: string, days: number) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};
async function signUp(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({
    extraHTTPHeaders: ownClientAddress(),
  });
  contexts.push(context);
  await signUpVerified(context.request, baseURL, {
    name: "Transfer Tester",
    email: `transfer-${crypto.randomUUID()}@example.test`,
  });
  const session = await (
    await context.request.get("/api/auth/get-session")
  ).json();
  users.push(session.user.id);
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    if (
      expectedFailure.has(page) &&
      /Minified React error #(419|441)/.test(error.message)
    )
      return;
    errors.push(error.message);
  });
  return { context, page, userId: session.user.id as string };
}
async function fixture(browser: Browser, baseURL: string | undefined) {
  const fx = await signUp(browser, baseURL);
  await fx.page.goto("/transactions");
  await expect(
    fx.page.getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();
  const ws = new URL(fx.page.url()).pathname.split("/")[2]!;
  const cash = crypto.randomUUID(),
    card = crypto.randomUUID();
  await pool.query(
    `INSERT INTO financial_account (id,workspace_id,institution_name,type,nickname,source,current_balance_cents,balance_as_of) VALUES ($1,$3,'Synthetic','checking','Everyday','manual',50000,$4),($2,$3,'Synthetic','credit_card','Card','manual',-10000,$4)`,
    [cash, card, ws, today],
  );
  return { ...fx, ws, cash, card, path: `/w/${ws}/transactions/transfers` };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function activity(
  fx: Fixture,
  account: string,
  amount: number,
  description: string,
  extra: {
    on?: string;
    transfer?: boolean;
    pair?: string;
    status?: string;
  } = {},
) {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "transaction" (id,workspace_id,financial_account_id,posted_on,amount_cents,description_raw,source,fingerprint,is_transfer,transfer_pair_id,status) VALUES ($1,$2,$3,$4,$5,$6,'manual',$1,$7,$8,$9)`,
    [
      id,
      fx.ws,
      account,
      extra.on ?? today,
      amount,
      description,
      extra.transfer ?? false,
      extra.pair ?? null,
      extra.status ?? "posted",
    ],
  );
  return id;
}
async function open(fx: Fixture, source?: string, query = "") {
  await fx.page.goto(
    `${fx.path}?view=all${source ? `&source=${source}` : ""}${query}`,
  );
  await expect(
    fx.page.getByRole("heading", { name: "Review transfers", exact: true }),
  ).toBeVisible();
  await hydrated(fx.page, 'form[aria-label="Transfer filters"] button');
}
async function confirmPair(page: Page, description: string, candidate = 0) {
  const form = page.getByRole("form", {
    name: `Confirm pairing: ${description}`,
    exact: true,
  });
  await form.getByRole("radio").nth(candidate).check();
  await form.getByRole("checkbox").check();
  await form
    .getByRole("button", { name: "Confirm pairing", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
}
async function change(page: Page, name: string, description: string) {
  const form = page.getByRole("form", {
    name: `${name}: ${description}`,
    exact: true,
  });
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name, exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
}
const snapshot = async (ws: string) =>
  (
    await pool.query(
      `SELECT * FROM "transaction" WHERE workspace_id=$1 ORDER BY id`,
      [ws],
    )
  ).rows;
const balances = async (ws: string) =>
  (
    await pool.query(
      `SELECT * FROM financial_account WHERE workspace_id=$1 ORDER BY id`,
      [ws],
    )
  ).rows;
test.afterAll(async () => {
  for (const context of contexts) await context.close();
  if (users.length) {
    await pool.query(
      `DELETE FROM organization WHERE id IN (SELECT organization_id FROM member WHERE user_id=ANY($1::text[]) AND role='owner')`,
      [users],
    );
    await pool.query(`DELETE FROM "user" WHERE id=ANY($1::text[])`, [users]);
  }
  await pool.end();
  expect(errors).toEqual([]);
  contexts.length = 0;
  users.length = 0;
  errors.length = 0;
});
test("requires a specific ambiguous counterpart and confirmation, persists pairing and separates detach from normal activity", async ({
  browser,
  baseURL,
}) => {
  const fx = await fixture(browser, baseURL);
  const source = await activity(fx, fx.cash, -20000, "Cash repayment");
  await activity(fx, fx.card, 20000, "Card credit one");
  await activity(fx, fx.card, 20000, "Card credit two");
  await fx.page.reload();
  await fx.page
    .getByRole("link", { name: "Review transfers", exact: true })
    .click();
  await expect(fx.page.getByText(/90-day review window/)).toBeVisible();
  await open(fx, source);
  const before = await snapshot(fx.ws),
    accounts = await balances(fx.ws);
  const form = fx.page.getByRole("form", {
    name: "Confirm pairing: Cash repayment",
    exact: true,
  });
  await expect(form.getByRole("radio", { checked: true })).toHaveCount(0);
  await form
    .getByRole("button", { name: "Confirm pairing", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText(
    "Choose a specific counterpart",
  );
  expect(await snapshot(fx.ws)).toEqual(before);
  await confirmPair(fx.page, "Cash repayment", 1);
  await expect(
    fx.page.getByRole("heading", { name: "Confirmed pair", exact: true }),
  ).toBeVisible();
  const saved = await snapshot(fx.ws);
  expect(saved.filter((r) => r.transfer_pair_id)).toHaveLength(2);
  expect(await balances(fx.ws)).toEqual(accounts);
  await fx.page.reload();
  await expect(
    fx.page.getByRole("heading", { name: "Confirmed pair", exact: true }),
  ).toBeVisible();
  await change(
    fx.page,
    "Remove pairing, keep transfer labels",
    "Cash repayment",
  );
  const detached = await snapshot(fx.ws);
  expect(detached.filter((r) => r.is_transfer)).toHaveLength(2);
  expect(detached.every((r) => r.transfer_pair_id === null)).toBe(true);
  await expect(
    fx.page.getByRole("heading", { name: "Individual transfer", exact: true }),
  ).toBeVisible();
  await change(fx.page, "Count as normal activity", "Cash repayment");
  expect(
    (await snapshot(fx.ws)).find((r) => r.id === source)?.is_transfer,
  ).toBe(false);
  expect(await balances(fx.ws)).toEqual(accounts);
});
test("retains a stale selection, rejects a competing match and permits retry after reloading", async ({
  browser,
  baseURL,
}) => {
  const fx = await fixture(browser, baseURL),
    source = await activity(fx, fx.cash, -20000, "Stale cash"),
    partner = await activity(fx, fx.card, 20000, "Stale card");
  await open(fx, source);
  const form = fx.page.getByRole("form", {
    name: "Confirm pairing: Stale cash",
    exact: true,
  });
  await form.getByRole("radio").check();
  await form.getByRole("checkbox").check();
  await pool.query(
    `UPDATE "transaction" SET description_raw='Changed card',updated_at=now() WHERE id=$1`,
    [partner],
  );
  await form
    .getByRole("button", { name: "Confirm pairing", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText(
    "changed since the form was opened",
  );
  await expect(form.getByRole("radio")).toBeChecked();
  await expect(form.getByRole("checkbox")).toBeChecked();
  expect((await snapshot(fx.ws)).every((r) => !r.is_transfer)).toBe(true);
  await fx.page.reload();
  await hydrated(fx.page, 'form[aria-label="Transfer filters"] button');
  await confirmPair(fx.page, "Stale cash");
});
test("protects paired transaction edits and atomically detaches the survivor on delete with normal balance undo", async ({
  browser,
  baseURL,
}) => {
  const fx = await fixture(browser, baseURL),
    source = await activity(fx, fx.cash, -20000, "Delete cash"),
    partner = await activity(fx, fx.card, 20000, "Survivor card");
  await pool.query(
    `UPDATE financial_account SET current_balance_cents=30000 WHERE id=$1`,
    [fx.cash],
  );
  await open(fx, source);
  await confirmPair(fx.page, "Delete cash");
  await fx.page
    .getByRole("link", { name: "Edit transaction", exact: true })
    .click();
  await hydrated(fx.page, 'form input[name="description"]');
  await expect(
    fx.page.getByRole("textbox", { name: "Amount", exact: true }),
  ).toHaveCount(0);
  await expect(
    fx.page.getByRole("checkbox", { name: /Transfer/ }),
  ).toBeDisabled();
  await fx.page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Edited cash description");
  await fx.page
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await fx.page.goto(`/w/${fx.ws}/transactions/${source}`);
  await hydrated(fx.page, 'form input[name="description"]');
  await fx.page
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
  await fx.page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(fx.page).toHaveURL(new RegExp(`/w/${fx.ws}/transactions$`));
  expect((await snapshot(fx.ws)).find((r) => r.id === partner)).toMatchObject({
    is_transfer: true,
    transfer_pair_id: null,
  });
  expect(
    (await balances(fx.ws)).find((r) => r.id === fx.cash)
      ?.current_balance_cents,
  ).toBe("50000");
});
test("loads older padded counterparts across pages and supports narrow screens, keyboard focus and dark mode", async ({
  browser,
  baseURL,
}) => {
  const fx = await fixture(browser, baseURL),
    sourceOn = shift(today, -100),
    source = await activity(fx, fx.cash, -10001, "Older cash", {
      on: sourceOn,
    });
  for (let i = 0; i < 22; i++)
    await activity(fx, fx.card, 10001, `Older counterpart ${i}`, {
      on: shift(sourceOn, -1),
    });
  await open(fx);
  await expect(
    fx.page.getByText("No recorded activity in this review.", { exact: false }),
  ).toBeVisible();
  const filters = fx.page.getByRole("form", {
    name: "Transfer filters",
    exact: true,
  });
  await filters.getByLabel("From", { exact: true }).fill(sourceOn);
  await filters.getByLabel("Through", { exact: true }).fill(sourceOn);
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(fx.page.getByText(/22 eligible counterparts/)).toBeVisible();
  await fx.page
    .getByRole("link", { name: "More counterparts", exact: true })
    .click();
  const form = fx.page.getByRole("form", {
    name: "Confirm pairing: Older cash",
    exact: true,
  });
  await expect(form.getByRole("radio")).toHaveCount(2);
  await expect(form.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(
    fx.page.getByRole("link", { name: "Previous counterparts", exact: true }),
  ).toBeVisible();
  await mkdir("docs/screenshots/transfers", { recursive: true });
  for (const width of [360, 1280])
    for (const colorScheme of ["light", "dark"] as const) {
      await fx.page.setViewportSize({ width, height: 900 });
      await fx.page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      expect(
        await fx.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await form.getByRole("radio").first().focus();
      await fx.page.keyboard.press("Space");
      await expect(form.getByRole("radio").first()).toBeChecked();
      // Focus scrolls the form into view; capture the sticky header at the top.
      await fx.page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await fx.page.screenshot({
        path: `docs/screenshots/transfers/${width}-${colorScheme}.png`,
        fullPage: true,
      });
    }
  await confirmPair(fx.page, "Older cash");
  await fx.page.reload();
  await expect(
    fx.page.getByRole("heading", { name: "Confirmed pair", exact: true }),
  ).toBeVisible();
  expect(
    (await snapshot(fx.ws)).find((r) => r.id === source)?.is_transfer,
  ).toBe(true);
});
test("shows invalid and orphan groups without repairing them and lets viewers read while excluding outsiders", async ({
  browser,
  baseURL,
}) => {
  const fx = await fixture(browser, baseURL);
  const orphan = await activity(fx, fx.cash, -20000, "Orphan transfer", {
    transfer: true,
    pair: "orphan",
  });
  await activity(fx, fx.cash, -50, "Invalid first", {
    transfer: true,
    pair: "invalid",
  });
  await activity(fx, fx.card, -60, "Invalid second", { pair: "invalid" });
  await fx.page.goto(`${fx.path}?view=pairs`);
  await expect(
    fx.page.getByRole("heading", { name: "Review transfers", exact: true }),
  ).toBeVisible();
  await expect(
    fx.page.getByRole("heading", { name: "Incomplete pairing", exact: true }),
  ).toBeVisible();
  await expect(
    fx.page.getByRole("heading", {
      name: "Invalid existing pair",
      exact: true,
    }),
  ).toBeVisible();
  const viewer = await signUp(browser, baseURL);
  await pool.query(
    `INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'viewer',now())`,
    [crypto.randomUUID(), fx.ws, viewer.userId],
  );
  await viewer.page.goto(`${fx.path}?view=pairs`);
  await expect(viewer.page.getByText(/Viewer access:/)).toBeVisible();
  await expect(
    viewer.page.getByRole("button", {
      name: /pairing|transfer|normal activity/,
    }),
  ).toHaveCount(0);
  await expect(
    viewer.page.getByRole("link", { name: "Edit transaction", exact: true }),
  ).toHaveCount(0);
  const outsider = await signUp(browser, baseURL);
  await outsider.page.goto(`${fx.path}?source=${orphan}&view=all`);
  await expect(
    outsider.page.getByText("This page could not be found."),
  ).toBeVisible();
  await expect(
    outsider.page.getByText("Orphan transfer", { exact: true }),
  ).toHaveCount(0);
  await open(fx, orphan);
  await change(
    fx.page,
    "Remove pairing, keep transfer labels",
    "Orphan transfer",
  );
  expect((await snapshot(fx.ws)).find((r) => r.id === orphan)).toMatchObject({
    is_transfer: true,
    transfer_pair_id: null,
  });
});
test("blocks label changes to allocated Bills evidence and shows the explicit unlink route", async ({
  browser,
  baseURL,
}) => {
  const fx = await fixture(browser, baseURL),
    source = await activity(fx, fx.cash, -20000, "Evidence cash");
  const series = crypto.randomUUID(),
    detail = crypto.randomUUID(),
    cycle = crypto.randomUUID(),
    payment = crypto.randomUUID();
  await pool.query(
    `INSERT INTO recurring_series (id,workspace_id,financial_account_id,merchant_normalized,name,kind,decision,amount_mode,schedule_unit,schedule_every,amount_cents,baseline_amount_cents,next_on) VALUES ($1,$2,$3,'evidence cash','Evidence','bill','confirmed','fixed','months',1,20000,20000,$4)`,
    [series, fx.ws, fx.cash, today],
  );
  await pool.query(
    `INSERT INTO bill_details (id,workspace_id,financial_account_id,merchant_normalized,anchor_on,date_source) VALUES ($1,$2,$3,'evidence cash',$4,'user')`,
    [detail, fx.ws, fx.cash, today],
  );
  await pool.query(
    `INSERT INTO bill_cycle (id,workspace_id,bill_id,scheduled_on,due_on,invoice_cents,estimate_cents,date_source) VALUES ($1,$2,$3,$4,$4,20000,20000,'user')`,
    [cycle, fx.ws, detail, today],
  );
  await pool.query(
    `INSERT INTO bill_payment (id,workspace_id,cycle_id,evidence_workspace_id,transaction_id,original_transaction_id,financial_account_id,amount_cents,posted_on,description,is_transfer) VALUES ($1,$2,$3,$2,$4,$4,$5,20000,$6,'Evidence cash',false)`,
    [payment, fx.ws, cycle, source, fx.cash, today],
  );
  await open(fx, source);
  const form = fx.page.getByRole("form", {
    name: "Mark as an individual transfer: Evidence cash",
    exact: true,
  });
  await form.getByRole("checkbox").check();
  await form
    .getByRole("button", {
      name: "Mark as an individual transfer",
      exact: true,
    })
    .click();
  await expect(form.getByRole("alert")).toContainText(
    "Unlink its evidence in Bills first",
  );
  await expect(
    form.getByRole("link", { name: "Review payment evidence in Bills" }),
  ).toHaveAttribute("href", `/w/${fx.ws}/bills?account=${fx.cash}`);
  expect(
    (await snapshot(fx.ws)).find((r) => r.id === source)?.is_transfer,
  ).toBe(false);
});
test("recovers a failed review read without showing a false empty state", async ({
  browser,
  baseURL,
}) => {
  const fx = await fixture(browser, baseURL);
  await activity(fx, fx.cash, -100, "Recovery activity");
  const result = await pool.query(
    `INSERT INTO financial_account (id,workspace_id,institution_name,type,nickname,source,current_balance_cents) SELECT gen_random_uuid()::text,$1,'Test','checking','Overflow','synthetic',0 FROM generate_series(1,999) RETURNING id`,
    [fx.ws],
  );
  expectedFailure.add(fx.page);
  await fx.page.goto(fx.path);
  await expect(fx.page.getByRole("main").getByRole("alert")).toContainText(
    "Transfer review is temporarily unavailable",
  );
  await expect(
    fx.page.getByText(/No recorded activity in this review/),
  ).toHaveCount(0);
  await pool.query(`DELETE FROM financial_account WHERE id=ANY($1::text[])`, [
    result.rows.map((r) => r.id),
  ]);
  await hydrated(fx.page, "main button");
  await fx.page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    fx.page.getByRole("heading", { name: "Review transfers", exact: true }),
  ).toBeVisible();
  await expect(
    fx.page.getByRole("article", { name: "Recovery activity" }),
  ).toBeVisible();
  expectedFailure.delete(fx.page);
});

test("retains selection after a failed save request and retries without reclassification", async ({
  browser,
  baseURL,
}) => {
  const fx = await fixture(browser, baseURL),
    source = await activity(fx, fx.cash, -20000, "Retry cash");
  await activity(fx, fx.card, 20000, "Retry card");
  await open(fx, source);
  const form = fx.page.getByRole("form", {
    name: "Confirm pairing: Retry cash",
    exact: true,
  });
  await form.getByRole("radio").check();
  await form.getByRole("checkbox").check();
  const requestStarted = Promise.withResolvers<void>();
  const releaseRequest = Promise.withResolvers<void>();
  await fx.page.route(
    (url) => url.pathname === fx.path,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requestStarted.resolve();
      await releaseRequest.promise;
      await route.abort("failed");
    },
  );
  await form
    .getByRole("button", { name: "Confirm pairing", exact: true })
    .click();
  await requestStarted.promise;
  await expect(
    form.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  await expect(form.getByRole("checkbox")).toBeDisabled();
  releaseRequest.resolve();
  await expect(form.getByRole("alert")).toContainText(
    "Your selection is kept; try again",
  );
  await expect(form.getByRole("radio")).toBeChecked();
  await expect(form.getByRole("checkbox")).toBeChecked();
  expect((await snapshot(fx.ws)).every((r) => !r.is_transfer)).toBe(true);
  await fx.page.unrouteAll({ behavior: "wait" });
  await form
    .getByRole("button", { name: "Confirm pairing", exact: true })
    .click();
  await expect(
    fx.page.getByRole("heading", { name: "Confirmed pair", exact: true }),
  ).toBeVisible();
});
