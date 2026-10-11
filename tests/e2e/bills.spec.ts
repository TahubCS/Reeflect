import { mkdir } from "node:fs/promises";
import {
  type Browser,
  type BrowserContext,
  type Locator,
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
const detail = (page: Page) =>
  page.getByRole("region", { name: "Bill detail", exact: true });
const figure = (area: Locator, label: string) =>
  area
    .locator("dl > div")
    .filter({ has: area.page().getByText(label, { exact: true }) })
    .locator("dd");
async function signUp(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({
    extraHTTPHeaders: ownClientAddress(),
  });
  contexts.push(context);
  await signUpVerified(context.request, baseURL, {
    name: "Bills Tester",
    email: `bill-${crypto.randomUUID()}@example.test`,
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
  return { context, userId: session.user.id as string, page };
}
async function fixture(browser: Browser, baseURL: string | undefined) {
  const f = await signUp(browser, baseURL);
  await f.page.goto("/bills");
  await expect(
    f.page.getByRole("heading", { name: "Bills", exact: true }),
  ).toBeVisible();
  const workspaceId = new URL(f.page.url()).pathname.split("/")[2]!;
  const accountId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO financial_account (id,workspace_id,institution_name,type,nickname,source,current_balance_cents,balance_as_of) VALUES ($1,$2,'Synthetic','checking','Everyday','synthetic',50000,$3)`,
    [accountId, workspaceId, today],
  );
  await f.page.reload();
  return { ...f, workspaceId, accountId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function add(f: Fixture, invoice = "184", name = "Electric") {
  await f.page.getByText("Add a bill", { exact: true }).click();
  await hydrated(f.page, 'form[aria-label="Add a bill"] button');
  const form = f.page.getByRole("form", { name: "Add a bill", exact: true });
  await form.getByLabel("Bill name", { exact: true }).fill(name);
  await form.getByLabel("Typical amount (USD)").fill("145");
  await form.getByLabel("First due date").fill(today);
  await form.getByLabel("Current invoice amount (USD, optional)").fill(invoice);
  await form.getByRole("button", { name: "Add bill", exact: true }).click();
  await expect(
    detail(f.page).getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await hydrated(f.page, 'form[aria-label="Current invoice"] button');
}
async function activity(
  f: Fixture,
  amount = -10000,
  extra: { transfer?: boolean; status?: string; description?: string } = {},
) {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "transaction" (id,workspace_id,financial_account_id,posted_on,amount_cents,description_raw,source,fingerprint,is_transfer,status) VALUES ($1,$2,$3,$4,$5,$6,'manual',$1,$7,$8)`,
    [
      id,
      f.workspaceId,
      f.accountId,
      today,
      amount,
      extra.description ?? "Electric",
      extra.transfer ?? false,
      extra.status ?? "posted",
    ],
  );
  return id;
}
async function link(page: Page, transactionId: string) {
  await hydrated(page, 'form[aria-label="Link a posted payment"] button');
  const form = page.getByRole("form", { name: "Link a posted payment" });
  await form
    .getByLabel("Posted payment", { exact: true })
    .selectOption(transactionId);
  await form.getByLabel("I confirm this transaction paid this invoice").check();
  await form.getByRole("button", { name: "Link payment", exact: true }).click();
}
test.afterAll(async () => {
  await Promise.all(contexts.map((c) => c.close()));
  if (users.length) {
    await pool.query(
      `DELETE FROM organization WHERE id IN (SELECT organization_id FROM member WHERE user_id=ANY($1::text[]) AND role='owner')`,
      [users],
    );
    await pool.query(`DELETE FROM "user" WHERE id=ANY($1::text[])`, [users]);
  }
  await pool.end();
  expect(errors).toEqual([]);
});

test("tracks variable invoices, partial/full payments, unlinking and manual marks without changing financial records", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  const first = await activity(f);
  const second = await activity(f, -8400);
  await add(f);
  expect(await figure(detail(f.page), "Invoice amount").textContent()).toBe(
    "$184.00",
  );
  await link(f.page, first);
  await expect(figure(detail(f.page), "Remaining")).toHaveText("$84.00");
  await expect(
    detail(f.page).getByText("Partially paid", { exact: true }),
  ).toBeVisible();
  await link(f.page, second);
  await expect(
    detail(f.page).getByText("Paid from posted activity", { exact: true }),
  ).toBeVisible();
  await detail(f.page)
    .getByText("Unlink payment", { exact: true })
    .first()
    .click();
  await detail(f.page)
    .getByRole("button", { name: "Confirm unlink payment" })
    .click();
  await expect(
    detail(f.page).getByText("Partially paid", { exact: true }),
  ).toBeVisible();
  await detail(f.page)
    .getByRole("button", { name: "Mark paid manually", exact: true })
    .click();
  await expect(
    detail(f.page).getByText("Marked paid manually", { exact: true }),
  ).toBeVisible();
  await detail(f.page)
    .getByRole("button", { name: "Undo manual paid mark" })
    .click();
  await expect(
    detail(f.page).getByText("Partially paid", { exact: true }),
  ).toBeVisible();
  await f.page.reload();
  await expect(
    detail(f.page).getByText("Partially paid", { exact: true }),
  ).toBeVisible();
  const facts = await pool.query(
    `SELECT current_balance_cents,(SELECT count(*) FROM "transaction" WHERE workspace_id=$2) AS count FROM financial_account WHERE id=$1`,
    [f.accountId, f.workspaceId],
  );
  expect(Number(facts.rows[0].current_balance_cents)).toBe(50000);
  expect(Number(facts.rows[0].count)).toBe(2);
});

test("distinguishes unknown and zero invoices, keeps invalid input, and refuses stale forms", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  await add(f, "");
  await expect(figure(detail(f.page), "Typical estimate")).toHaveText(
    "$145.00",
  );
  const invoice = f.page.getByRole("form", { name: "Current invoice" });
  await invoice.getByLabel("Invoice amount (USD)", { exact: true }).fill("bad");
  await invoice.getByRole("button", { name: "Save invoice" }).click();
  await expect(invoice.getByRole("alert")).toBeVisible();
  await expect(
    invoice.getByLabel("Invoice amount (USD)", { exact: true }),
  ).toHaveValue("bad");
  await expect(
    invoice.getByLabel("Invoice amount (USD)", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await invoice.getByLabel("Invoice amount (USD)", { exact: true }).fill("0");
  await invoice.getByRole("button", { name: "Save invoice" }).click();
  await expect(
    detail(f.page).getByText("No payment due", { exact: true }),
  ).toBeVisible();
  const stale = await f.context.newPage();
  await stale.goto(f.page.url());
  await hydrated(stale, 'form[aria-label="Current invoice"] button');
  await invoice.getByLabel("Invoice amount (USD)", { exact: true }).fill("190");
  await invoice.getByRole("button", { name: "Save invoice" }).click();
  await expect(figure(detail(f.page), "Invoice amount")).toHaveText("$190.00");
  const other = stale.getByRole("form", { name: "Current invoice" });
  await other.getByLabel("Invoice amount (USD)", { exact: true }).fill("200");
  await other.getByRole("button", { name: "Save invoice" }).click();
  await expect(other.getByRole("alert")).toContainText(
    "changed since you opened",
  );
  await stale.reload();
  await expect(figure(detail(stale), "Invoice amount")).toHaveText("$190.00");
  await stale.close();
  await detail(f.page)
    .getByRole("button", { name: "Stop tracking bill" })
    .click();
  await expect(
    detail(f.page).getByText("Tracking is stopped here.", { exact: false }),
  ).toBeVisible();
  await expect(
    detail(f.page).getByRole("heading", { name: "Saved invoice history" }),
  ).toBeVisible();
  await detail(f.page)
    .getByRole("button", { name: "Restore tracking" })
    .click();
  await expect(
    detail(f.page).getByRole("button", { name: "Stop tracking bill" }),
  ).toBeVisible();
});

test("requires explicit payment confirmation and reviews edited or deleted payment evidence", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  const row = await activity(f, -18400);
  await activity(f, 100);
  await activity(f, -14500, { status: "pending" });
  await add(f);
  const payment = f.page.getByRole("form", { name: "Link a posted payment" });
  await payment.getByLabel("Posted payment", { exact: true }).selectOption(row);
  await payment.getByRole("button", { name: "Link payment" }).click();
  await expect(payment.getByRole("alert")).toContainText(
    "Confirm that this transaction",
  );
  await link(f.page, row);
  await expect(
    detail(f.page).getByText("Paid from posted activity", { exact: true }),
  ).toBeVisible();
  await pool.query(`UPDATE "transaction" SET amount_cents=-10000 WHERE id=$1`, [
    row,
  ]);
  await f.page.reload();
  await expect(
    detail(f.page).getByText("This payment changed or was removed.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(figure(detail(f.page), "Linked posted payments")).toHaveText(
    "$0.00",
  );
  await pool.query(`DELETE FROM "transaction" WHERE id=$1`, [row]);
  await f.page.reload();
  await expect(
    detail(f.page).getByRole("link", { name: "View recorded transaction" }),
  ).toHaveCount(0);
  await detail(f.page).getByText("Unlink payment", { exact: true }).click();
  await detail(f.page)
    .getByRole("button", { name: "Confirm unlink payment" })
    .click();
  await expect(
    detail(f.page).getByText("Unpaid", { exact: true }),
  ).toBeVisible();
});

test("offers read-only viewer access and hides all foreign workspace facts", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  await add(f);
  const viewer = await signUp(browser, baseURL);
  await pool.query(
    `INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'viewer',now())`,
    [crypto.randomUUID(), f.workspaceId, viewer.userId],
  );
  await viewer.page.goto(f.page.url());
  await expect(figure(detail(viewer.page), "Remaining")).toHaveText("$184.00");
  await expect(
    viewer.page.getByText("You have view-only access.", { exact: false }),
  ).toBeVisible();
  await expect(
    viewer.page.getByRole("button", { name: "Save invoice" }),
  ).toHaveCount(0);
  await expect(
    viewer.page.getByRole("button", { name: "Mark paid manually" }),
  ).toHaveCount(0);
  const outsider = await signUp(browser, baseURL);
  await outsider.page.goto(f.page.url());
  await expect(
    outsider.page.getByText("This page could not be found."),
  ).toBeVisible();
  await expect(detail(outsider.page)).toHaveCount(0);
});

test("paginates bills and payment candidates, filters dates/accounts and preserves mobile keyboard access", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  for (let n = 0; n < 23; n++) await activity(f, -100 - n);
  await add(f);
  const payment = f.page.getByRole("form", { name: "Link a posted payment" });
  await expect(payment.locator("option")).toHaveCount(21);
  await f.page.getByRole("link", { name: "More transactions" }).click();
  await expect(payment.locator("option")).toHaveCount(4);
  await pool.query(
    `INSERT INTO recurring_series (id,workspace_id,financial_account_id,merchant_normalized,name,decision,kind,amount_mode,schedule_unit,schedule_every,amount_cents,baseline_amount_cents,next_on,manual) SELECT gen_random_uuid()::text,$1,$2,'bill '||n,'Bill '||n,'confirmed','bill','fixed','months',1,100,100,$3,true FROM generate_series(1,21) n`,
    [f.workspaceId, f.accountId, today],
  );
  await f.page.goto(`/w/${f.workspaceId}/bills`);
  await expect(
    f.page
      .getByRole("region", { name: "Bill list", exact: true })
      .getByRole("article"),
  ).toHaveCount(20);
  await f.page.getByRole("link", { name: "Next bills" }).click();
  await expect(
    f.page
      .getByRole("region", { name: "Bill list", exact: true })
      .getByRole("article"),
  ).toHaveCount(2);
  const filter = f.page.getByRole("form", { name: "Filter bills" });
  await filter.getByLabel("Account", { exact: true }).selectOption(f.accountId);
  await filter.getByLabel("From date").fill("2199-01-01");
  await filter.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    f.page
      .getByRole("region", { name: "Bill list", exact: true })
      .getByRole("article"),
  ).toHaveCount(0);
  await f.page.goto(`/w/${f.workspaceId}/bills`);
  await f.page.setViewportSize({ width: 360, height: 800 });
  await f.page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await f.page.getByText("Add a bill", { exact: true }).click();
  await hydrated(f.page, 'form[aria-label="Add a bill"] button');
  const addForm = f.page.getByRole("form", { name: "Add a bill", exact: true });
  await addForm.getByLabel("Bill name", { exact: true }).fill("Rent");
  await addForm.getByLabel("Typical amount (USD)").fill("900");
  await addForm.getByLabel("Typical amount (USD)").press("Enter");
  await expect(
    detail(f.page).getByRole("heading", { name: "Rent", exact: true }),
  ).toBeVisible();
  await mkdir("docs/screenshots/bills", { recursive: true });
  for (const width of [360, 1440])
    for (const colorScheme of ["light", "dark"] as const) {
      await f.page.setViewportSize({ width, height: 900 });
      await f.page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await f.page.evaluate(async () => {
        window.scrollTo(0, 0);
        await document.fonts.ready;
      });
      expect(
        await f.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await f.page.screenshot({
        path: `docs/screenshots/bills/${width}-${colorScheme}.png`,
        fullPage: true,
      });
    }
});

test("recovers from a failed read and keeps navigation available without presenting false zero totals", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  await add(f);
  const row = await activity(f, -(Number.MAX_SAFE_INTEGER + 1));
  expectedFailure.add(f.page);
  await f.page.reload();
  await expect(f.page.getByRole("main").getByRole("alert")).toHaveText(
    "Bills are temporarily unavailable. Please try again.",
  );
  await expect(
    f.page.getByRole("region", { name: "Recorded cash versus bills" }),
  ).toHaveCount(0);
  await expect(
    f.page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await pool.query(`UPDATE "transaction" SET amount_cents=-100 WHERE id=$1`, [
    row,
  ]);
  await hydrated(f.page, "main button");
  await f.page.getByRole("button", { name: "Try again" }).click();
  await expect(
    f.page.getByRole("region", { name: "Recorded cash versus bills" }),
  ).toBeVisible();
  expectedFailure.delete(f.page);
});
