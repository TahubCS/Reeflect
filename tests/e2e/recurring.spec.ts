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

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5433/app_test",
  max: 2,
});
const users: string[] = [];
const contexts: BrowserContext[] = [];
const pageErrors: string[] = [];
const expectedServerFailures = new WeakSet<Page>();
const localToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const [year, month] = localToday.split("-").map(Number);
const date = (offset: number, day = 1) =>
  new Date(Date.UTC(year!, month! - 1 + offset, day))
    .toISOString()
    .slice(0, 10);

async function signup(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({
    extraHTTPHeaders: ownClientAddress(),
  });
  contexts.push(context);
  await signUpVerified(context.request, baseURL, {
    name: "Recurring Tester",
    email: `recurring-${crypto.randomUUID()}@example.test`,
  });
  const session = await context.request.get("/api/auth/get-session");
  const body = await session.json();
  users.push(body.user.id);
  return { context, userId: body.user.id as string };
}
async function addCharge(
  workspaceId: string,
  accountId: string,
  merchant: string,
  postedOn: string,
  amountCents: number,
  categoryId: string | null = null,
  fingerprint = crypto.randomUUID(),
) {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "transaction" (id, workspace_id, financial_account_id, description_raw, posted_on, amount_cents, category_id, source, fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7,'csv',$8) ON CONFLICT (financial_account_id,fingerprint) DO NOTHING`,
    [
      id,
      workspaceId,
      accountId,
      merchant,
      postedOn,
      amountCents,
      categoryId,
      fingerprint,
    ],
  );
  return { id, fingerprint };
}
async function fixture(browser: Browser, baseURL: string | undefined) {
  const { context, userId } = await signup(browser, baseURL);
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    if (
      expectedServerFailures.has(page) &&
      /Minified React error #419/.test(error.message)
    )
      return;
    pageErrors.push(error.message);
  });
  await page.goto("/subscriptions");
  await expect(
    page.getByRole("heading", { name: "Recurring payments", exact: true }),
  ).toBeVisible();
  const workspaceId = new URL(page.url()).pathname.split("/")[2]!;
  const accountId = crypto.randomUUID();
  const utilityId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO financial_account (id, workspace_id, institution_name, type, nickname, source, current_balance_cents) VALUES ($1,$2,'Synthetic bank','checking','Everyday','synthetic',50000)`,
    [accountId, workspaceId],
  );
  await pool.query(
    `INSERT INTO category (id, workspace_id, name, preset_key, sort_order) VALUES ($1,$2,'Utilities','utilities',0)`,
    [utilityId, workspaceId],
  );
  for (let i = 0; i < 3; i += 1) {
    await addCharge(
      workspaceId,
      accountId,
      "Stream Service",
      date(i - 3),
      -1599,
    );
    await addCharge(
      workspaceId,
      accountId,
      "City Electric",
      date(i - 3),
      [-9500, -13000, -11000][i]!,
      utilityId,
    );
  }
  for (const day of [1, 3, 20])
    await addCharge(
      workspaceId,
      accountId,
      "Irregular Market",
      date(-1, day),
      -500,
    );
  await page.reload();
  await hydrated(page, "button");
  return { page, context, userId, workspaceId, accountId, utilityId };
}
const card = (page: Page, name: string) =>
  page.getByRole("article", { name, exact: true });
const totals = (page: Page) =>
  page.getByRole("region", { name: "Workspace recurring totals" });
const filters = (page: Page) =>
  page.getByRole("form", { name: "Filter recurring payments" });

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  if (users.length) {
    await pool.query(
      `DELETE FROM organization WHERE id IN (SELECT organization_id FROM member WHERE user_id = ANY($1::text[]))`,
      [users],
    );
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [users]);
  }
  await pool.end();
  expect(pageErrors).toEqual([]);
});

test("shows evidence for variable bills and fixed subscriptions, requiring confirmation", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL);
  await expect(card(page, "city electric")).toContainText(
    "Bill · Monthly · Variable amount",
  );
  await expect(card(page, "city electric")).toContainText("$95.00–$130.00");
  await expect(card(page, "stream service")).toContainText(
    "Subscription · Monthly · Fixed amount",
  );
  await expect(
    page.getByRole("article", { name: "irregular market" }),
  ).toHaveCount(0);
  await expect(totals(page)).toContainText("$0.00");
  await card(page, "city electric")
    .getByText("Recent matching charges (3)")
    .click();
  await expect(card(page, "city electric")).toContainText(date(-3));
  await card(page, "city electric")
    .getByRole("button", { name: "Confirm recurring payment" })
    .click();
  await expect(card(page, "city electric")).toContainText("Tracking");
  await expect(totals(page)).toContainText("$110.00");
  await expect(totals(page)).toContainText("$1,320.00");
  await expect(
    card(page, "city electric").getByRole("button", {
      name: "Planning to cancel",
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(totals(page)).toContainText("$110.00");
});

test("saves subscription intentions and keeps current costs during refresh", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL);
  await card(page, "stream service")
    .getByRole("button", { name: "Confirm recurring payment" })
    .click();
  await card(page, "stream service")
    .getByRole("button", { name: "Planning to cancel", exact: true })
    .click();
  await expect(card(page, "stream service")).toContainText(
    "Choice: Planning to cancel",
  );
  await expect(totals(page)).toContainText("$191.88");
  await page.getByRole("button", { name: "Refresh patterns" }).click();
  await expect(card(page, "stream service")).toContainText(
    "Choice: Planning to cancel",
  );
  await expect(totals(page)).toContainText("$15.99");
  await card(page, "stream service")
    .getByRole("button", { name: "Keep", exact: true })
    .click();
  await expect(card(page, "stream service")).toContainText("Choice: Keep");
  await card(page, "stream service")
    .getByRole("button", { name: "Clear choice" })
    .click();
  await expect(card(page, "stream service")).toContainText(
    "Choice: No choice saved",
  );
});

test("refreshes later imported payments, net refunds and duplicate fingerprints safely", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, accountId, utilityId } = await fixture(
    browser,
    baseURL,
  );
  await card(page, "city electric")
    .getByRole("button", { name: "Confirm recurring payment" })
    .click();
  const imported = await addCharge(
    workspaceId,
    accountId,
    "City Electric",
    date(0),
    -14000,
    utilityId,
  );
  await addCharge(
    workspaceId,
    accountId,
    "City Electric",
    date(0),
    -14000,
    utilityId,
    imported.fingerprint,
  );
  await addCharge(
    workspaceId,
    accountId,
    "City Electric",
    date(0),
    2000,
    utilityId,
  );
  await page.getByRole("button", { name: "Refresh patterns" }).click();
  await expect(card(page, "city electric")).toContainText(
    "$130.00 per payment",
  );
  await expect(card(page, "city electric")).toContainText("$120.00");
  await expect(card(page, "city electric")).not.toContainText(
    "Latest charge differs",
  );
  const balance = await pool.query(
    `SELECT current_balance_cents FROM financial_account WHERE id=$1`,
    [accountId],
  );
  expect(Number(balance.rows[0].current_balance_cents)).toBe(50000);
});

test("creates, corrects, removes and restores a manual rent payment", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, accountId } = await fixture(browser, baseURL);
  await page.getByText("Add a recurring payment", { exact: true }).click();
  const add = page.locator("details").filter({
    has: page.getByText("Add a recurring payment", { exact: true }),
  });
  await add.getByLabel("Payee as shown on transactions").fill("Landlord");
  await add.getByLabel("Payment name", { exact: true }).fill("Rent");
  await add.getByLabel("Amount behavior").selectOption("fixed");
  await add.getByLabel("Amount per payment (USD estimate)").fill("1300");
  await add.getByLabel("Use recent charges to update the estimate").uncheck();
  await add.getByLabel("Next date (entered by you)").fill(date(1));
  await add
    .getByRole("button", { name: "Add recurring payment", exact: true })
    .click();
  await expect(card(page, "Rent")).toContainText("$1,300.00");
  await card(page, "Rent").getByText("Edit payment", { exact: true }).click();
  await expect(
    card(page, "Rent").getByLabel("Use recent charges to update the estimate"),
  ).not.toBeChecked();
  await card(page, "Rent")
    .getByLabel("Payment name", { exact: true })
    .fill("Home rent");
  await card(page, "Rent")
    .getByLabel("Amount per payment (USD estimate)")
    .fill("1350");
  await card(page, "Rent")
    .getByRole("button", { name: "Save corrections" })
    .click();
  await expect(card(page, "Home rent")).toContainText("$1,350.00");
  await card(page, "Home rent")
    .getByText("Remove tracking", { exact: true })
    .click();
  await card(page, "Home rent")
    .getByRole("button", { name: "Confirm remove tracking" })
    .click();
  await expect(card(page, "Home rent")).toHaveCount(0);
  await filters(page).getByLabel("Tracking state").selectOption("dismissed");
  await filters(page).getByRole("button", { name: "Apply filters" }).click();
  await card(page, "Home rent")
    .getByRole("button", { name: "Restore tracking" })
    .click();
  await expect(card(page, "Home rent")).toContainText("$1,350.00");
  const rows = await pool.query(
    `SELECT count(*) AS count FROM "transaction" WHERE workspace_id=$1 AND financial_account_id=$2 AND description_raw='Landlord'`,
    [workspaceId, accountId],
  );
  expect(Number(rows.rows[0].count)).toBe(0);
});

test("dismisses false positives persistently and restores the suggestion", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL);
  // Each step waits for the one before it to finish. On a slow machine the
  // two saves and the filter navigation otherwise overlap, and the page can
  // end up back on the unfiltered list.
  const saved = () => expect(page.getByText("Saving…")).toHaveCount(0);
  await card(page, "stream service")
    .getByRole("button", { name: "Not recurring" })
    .click();
  await expect(card(page, "stream service")).toHaveCount(0);
  await saved();
  await page.getByRole("button", { name: "Refresh patterns" }).click();
  await saved();
  await expect(card(page, "stream service")).toHaveCount(0);
  await filters(page).getByLabel("Tracking state").selectOption("dismissed");
  await filters(page).getByRole("button", { name: "Apply filters" }).click();
  await page.waitForURL(/[?&]state=dismissed/);
  await card(page, "stream service")
    .getByRole("button", { name: "Restore tracking" })
    .click();
  await expect(card(page, "stream service")).toContainText("Suggested pattern");
});

test("retains invalid form input and allows correcting kind/amount behavior", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL);
  await card(page, "stream service")
    .getByRole("button", { name: "Confirm recurring payment" })
    .click();
  await card(page, "stream service")
    .getByText("Edit payment", { exact: true })
    .click();
  await card(page, "stream service")
    .getByLabel("Amount per payment (USD estimate)")
    .fill("nonsense");
  await card(page, "stream service")
    .getByRole("button", { name: "Save corrections" })
    .click();
  await expect(card(page, "stream service").getByRole("alert")).toBeVisible();
  await expect(
    card(page, "stream service").getByLabel(
      "Amount per payment (USD estimate)",
    ),
  ).toHaveValue("nonsense");
  await card(page, "stream service")
    .getByLabel("Amount per payment (USD estimate)")
    .fill("16");
  await card(page, "stream service")
    .getByLabel("Payment kind")
    .selectOption("bill");
  await card(page, "stream service")
    .getByLabel("Amount behavior")
    .selectOption("variable");
  await card(page, "stream service")
    .getByRole("button", { name: "Save corrections" })
    .click();
  await expect(card(page, "stream service")).toContainText(
    "Bill · Monthly · Variable amount",
  );
  await expect(
    card(page, "stream service").getByRole("button", {
      name: "Planning to cancel",
    }),
  ).toHaveCount(0);
});

test("viewers see derived patterns without writes and strangers cannot read the workspace", async ({
  browser,
  baseURL,
}) => {
  const owner = await fixture(browser, baseURL);
  const viewer = await signup(browser, baseURL);
  await pool.query(
    `INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1,$2,$3,'viewer',now())`,
    [crypto.randomUUID(), owner.workspaceId, viewer.userId],
  );
  const before = await pool.query(
    `SELECT * FROM recurring_series WHERE workspace_id=$1`,
    [owner.workspaceId],
  );
  const view = await viewer.context.newPage();
  view.on("pageerror", (error) => pageErrors.push(error.message));
  await view.goto(`/w/${owner.workspaceId}/subscriptions`);
  await expect(card(view, "city electric")).toContainText("Suggested pattern");
  await expect(view.getByText("Read-only access")).toBeVisible();
  await expect(
    view.getByRole("button", { name: "Confirm recurring payment" }),
  ).toHaveCount(0);
  await expect(
    view.getByRole("button", { name: "Refresh patterns" }),
  ).toHaveCount(0);
  expect(
    (
      await pool.query(`SELECT * FROM recurring_series WHERE workspace_id=$1`, [
        owner.workspaceId,
      ])
    ).rows,
  ).toEqual(before.rows);
  const outsider = await signup(browser, baseURL);
  const foreign = await outsider.context.newPage();
  foreign.on("pageerror", (error) => pageErrors.push(error.message));
  await foreign.goto(`/w/${owner.workspaceId}/subscriptions`);
  await expect(
    foreign.getByText("This page could not be found."),
  ).toBeVisible();
  await expect(foreign.getByRole("article")).toHaveCount(0);
});

test("filters kinds and paginates large workspaces without truncating totals", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, accountId } = await fixture(browser, baseURL);
  await pool.query(
    `INSERT INTO recurring_series (id, workspace_id, financial_account_id, merchant_normalized, name, decision, kind, amount_mode, schedule_unit, schedule_every, baseline_amount_cents, amount_cents, next_on, manual) SELECT gen_random_uuid()::text,$1,$2,'manual ' || n,'Manual bill ' || n,'confirmed','bill','fixed','months',1,100,100,$3,true FROM generate_series(1,23) n`,
    [workspaceId, accountId, date(1)],
  );
  await page.reload();
  await expect(totals(page)).toContainText("$23.00");
  await expect(page.getByRole("article")).toHaveCount(20);
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(totals(page)).toContainText("$23.00");
  await filters(page).getByLabel("Payment kind").selectOption("subscription");
  await filters(page).getByRole("button", { name: "Apply filters" }).click();
  await expect(card(page, "stream service")).toBeVisible();
  await expect(card(page, "city electric")).toHaveCount(0);
});

test("recovers from a failed analysis while keeping navigation available", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, accountId } = await fixture(browser, baseURL);
  const broken = await addCharge(
    workspaceId,
    accountId,
    "Invalid amount fixture",
    date(0),
    -1_000_000_000_001,
  );
  expectedServerFailures.add(page);
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Recurring payments are temporarily unavailable. Please try again.",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await hydrated(page, "main button");
  await pool.query('UPDATE "transaction" SET amount_cents=-1234 WHERE id=$1', [
    broken.id,
  ]);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(card(page, "city electric")).toBeVisible();
  expectedServerFailures.delete(page);
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name: "Accounts", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
});

test("works at 360px in dark mode and reduced motion without overflow", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(
    page.getByRole("heading", { name: "Recurring payments", exact: true }),
  ).toBeVisible();
  await card(page, "city electric")
    .getByRole("button", { name: "Confirm recurring payment" })
    .click();
  await expect(totals(page)).toContainText("$110.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  await mkdir("docs/screenshots/recurring", { recursive: true });
  for (const [size, width] of [
    ["phone", 360],
    ["desktop", 1440],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await document.fonts.ready;
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `docs/screenshots/recurring/${size}-${theme}.png`,
        fullPage: true,
      });
    }
  }
});
