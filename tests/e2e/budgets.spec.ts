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
const users: string[] = [];
const contexts: BrowserContext[] = [];
const errors: string[] = [];
const expectedFailure = new WeakSet<Page>();
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const current = today.slice(0, 7);
const [year, month] = current.split("-").map(Number);
const date = (offset: number, day = 1) =>
  new Date(Date.UTC(year!, month! - 1 + offset, day))
    .toISOString()
    .slice(0, 10);
const selected = (offset: number) => date(offset).slice(0, 7);
const card = (page: Page, name = "Groceries") =>
  page.getByRole("article", { name, exact: true });
const figure = (article: Locator, label: string) =>
  article
    .locator("dl > div")
    .filter({ has: article.page().getByText(label, { exact: true }) })
    .locator("dd");
const totals = (page: Page) =>
  page.getByRole("region", { name: "Monthly budget totals" });
async function signUp(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({
    extraHTTPHeaders: ownClientAddress(),
  });
  contexts.push(context);
  await signUpVerified(context.request, baseURL, {
    name: "Budget Tester",
    email: `budget-${crypto.randomUUID()}@example.test`,
  });
  const session = await (
    await context.request.get("/api/auth/get-session")
  ).json();
  users.push(session.user.id);
  return { context, userId: session.user.id as string };
}
async function watch(context: BrowserContext) {
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    // A deliberately failed RSC read reports React's production error too.
    if (
      expectedFailure.has(page) &&
      /Minified React error #(419|441)/.test(error.message)
    )
      return;
    errors.push(error.message);
  });
  return page;
}
async function fixture(browser: Browser, baseURL: string | undefined) {
  const { context, userId } = await signUp(browser, baseURL);
  const page = await watch(context);
  await page.goto("/budgets");
  await expect(
    page.getByRole("heading", { name: "Budgets", exact: true }),
  ).toBeVisible();
  await expect(card(page)).toBeVisible();
  await hydrated(page, "main form button");
  const workspaceId = new URL(page.url()).pathname.split("/")[2]!;
  const accountId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO financial_account (id,workspace_id,institution_name,type,nickname,source,current_balance_cents) VALUES ($1,$2,'Synthetic bank','checking','Everyday','synthetic',50000)`,
    [accountId, workspaceId],
  );
  const categories = await pool.query<{ id: string; preset_key: string }>(
    `SELECT id,preset_key FROM category WHERE workspace_id=$1`,
    [workspaceId],
  );
  const key = (name: string) =>
    categories.rows.find((c) => c.preset_key === name)!.id;
  return { page, context, userId, workspaceId, accountId, key };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function activity(
  f: Fixture,
  amount: number,
  categoryId: string | null = f.key("groceries"),
  extras: {
    date?: string;
    manual?: boolean;
    transfer?: boolean;
    status?: string;
    accountId?: string;
    description?: string;
  } = {},
) {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "transaction" (id,workspace_id,financial_account_id,posted_on,amount_cents,description_raw,source,fingerprint,category_id,category_is_manual,is_transfer,status) VALUES ($1,$2,$3,$4,$5,$6,'csv',$1,$7,$8,$9,$10)`,
    [
      id,
      f.workspaceId,
      extras.accountId ?? f.accountId,
      extras.date ?? date(0),
      amount,
      extras.description ?? "Market",
      categoryId,
      extras.manual ?? true,
      extras.transfer ?? false,
      extras.status ?? "posted",
    ],
  );
  return id;
}
async function allocate(page: Page, amount: string, name = "Groceries") {
  const article = card(page, name);
  await hydrated(page, "main form button");
  await article.getByLabel("Monthly allocation (USD)").fill(amount);
  await article.getByRole("button", { name: /^(Set|Save) budget$/ }).click();
}
async function chooseMonth(page: Page, value: string) {
  const form = page.getByRole("form", { name: "Choose budget month" });
  await form.getByLabel("Month", { exact: true }).fill(value);
  await form.getByRole("button", { name: "View month" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${value}`));
}
test.afterAll(async () => {
  for (const context of contexts) await context.close();
  if (users.length) {
    await pool.query(
      `DELETE FROM organization WHERE id IN (SELECT organization_id FROM member WHERE user_id=ANY($1::text[]))`,
      [users],
    );
    await pool.query(`DELETE FROM "user" WHERE id=ANY($1::text[])`, [users]);
  }
  await pool.end();
  expect(errors).toEqual([]);
});

test("starts without invented spending, saves and edits a plan, and leaves ledger balances intact", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  await expect(
    f.page.getByText("No posted transactions recorded for this month.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    f.page.getByText("No budgets set for this month.", { exact: false }),
  ).toBeVisible();
  await expect(f.page.getByRole("article")).toHaveCount(15);
  await activity(f, -34000);
  await activity(f, 2000);
  await f.page.reload();
  await allocate(f.page, "500");
  await expect(figure(card(f.page), "Allocation")).toHaveText("$500.00");
  await expect(
    card(f.page)
      .getByRole("form", { name: "Groceries allocation" })
      .getByRole("status"),
  ).toHaveText("Budget saved.");
  await expect(figure(card(f.page), "Spent")).toHaveText("$320.00");
  await expect(figure(card(f.page), "Remaining")).toHaveText("$180.00");
  await expect(card(f.page).getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "64",
  );
  await allocate(f.page, "550");
  await expect(figure(card(f.page), "Remaining")).toHaveText("$230.00");
  await f.page.reload();
  await expect(figure(card(f.page), "Allocation")).toHaveText("$550.00");
  const facts = await pool.query(
    `SELECT current_balance_cents,(SELECT count(*) FROM "transaction" WHERE workspace_id=$2) AS count FROM financial_account WHERE id=$1`,
    [f.accountId, f.workspaceId],
  );
  expect(Number(facts.rows[0].current_balance_cents)).toBe(50000);
  expect(Number(facts.rows[0].count)).toBe(2);
});

test("distinguishes zero from unset, keeps spending after removal and retains invalid input", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  await activity(f, -34000);
  await f.page.reload();
  await allocate(f.page, "nonsense");
  await expect(card(f.page).getByRole("alert")).toBeVisible();
  await expect(card(f.page).getByLabel("Monthly allocation (USD)")).toHaveValue(
    "nonsense",
  );
  await expect(
    card(f.page).getByLabel("Monthly allocation (USD)"),
  ).toHaveAttribute("aria-invalid", "true");
  await allocate(f.page, "0");
  await expect(figure(card(f.page), "Allocation")).toHaveText("$0.00");
  await expect(figure(card(f.page), "Above plan")).toHaveText("$340.00");
  await expect(card(f.page).getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await card(f.page).getByRole("button", { name: "Remove budget" }).click();
  await expect(figure(card(f.page), "Allocation")).toHaveText("Not set");
  await expect(figure(card(f.page), "Spent")).toHaveText("$340.00");
  await expect(card(f.page).getByRole("progressbar")).toHaveCount(0);
  await expect(totals(f.page)).toContainText("Spent without a budget$340.00");
});

test("counts card purchases and net refunds, with visible uncategorized spending and transfer exclusions", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  const cardId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO financial_account (id,workspace_id,institution_name,type,nickname,source) VALUES ($1,$2,'Synthetic bank','credit_card','Card','synthetic')`,
    [cardId, f.workspaceId],
  );
  await activity(f, -34000, f.key("groceries"), { accountId: cardId });
  await activity(f, 2000);
  await activity(f, -7000, f.key("dining"));
  await activity(f, -2500, null);
  await activity(f, 5000, null);
  await activity(f, -90000, f.key("groceries"), { transfer: true });
  await activity(f, -90000, f.key("groceries"), { status: "pending" });
  await activity(f, -90000, f.key("groceries"), { date: date(1) });
  await activity(f, -90000, f.key("retirement"));
  await activity(f, 200000, f.key("income"));
  await f.page.reload();
  await allocate(f.page, "500");
  await expect(figure(card(f.page), "Spent")).toHaveText("$320.00");
  await expect(totals(f.page)).toContainText("Spent without a budget$70.00");
  await expect(
    f.page.getByRole("region", { name: "Spending coverage" }),
  ).toContainText("Uncategorized spending: $25.00");
  await expect(
    f.page.getByText("Total recorded spending, including Uncategorized:", {
      exact: false,
    }),
  ).toContainText("$415.00");
  for (const excluded of ["Income", "Retirement", "Investing"])
    await expect(card(f.page, excluded)).toHaveCount(0);
  await activity(f, 40000);
  await f.page.reload();
  await expect(figure(card(f.page), "Spent")).toHaveText("-$80.00");
  await expect(figure(card(f.page), "Remaining")).toHaveText("$580.00");
  await expect(card(f.page).getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
});

test("copies the previous plan into missing categories without overwriting zero or historical months", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  await pool.query(
    `INSERT INTO budget (id,workspace_id,category_id,month,amount_cents) VALUES ($1,$2,$3,$4,45000),($5,$2,$6,$4,12000)`,
    [
      crypto.randomUUID(),
      f.workspaceId,
      f.key("groceries"),
      selected(-1),
      crypto.randomUUID(),
      f.key("dining"),
    ],
  );
  await f.page.reload();
  await allocate(f.page, "0");
  await expect(figure(card(f.page), "Allocation")).toHaveText("$0.00");
  await f.page.getByRole("button", { name: "Copy previous month" }).click();
  await expect(figure(card(f.page, "Dining"), "Allocation")).toHaveText(
    "$120.00",
  );
  await expect(figure(card(f.page), "Allocation")).toHaveText("$0.00");
  await expect(
    f.page
      .getByRole("region", { name: "Copy previous budgets" })
      .getByRole("status"),
  ).toContainText("Copied 1 budget");
  await f.page.getByRole("button", { name: "Copy previous month" }).click();
  await expect(
    f.page
      .getByRole("region", { name: "Copy previous budgets" })
      .getByRole("status"),
  ).toContainText("No allocations to copy");
  await f.page
    .getByRole("link", { name: "Previous month", exact: true })
    .click();
  await expect(figure(card(f.page), "Allocation")).toHaveText("$450.00");
  await expect(
    f.page.getByText("Past budgets are read-only.", { exact: false }),
  ).toBeVisible();
  await expect(f.page.getByLabel("Monthly allocation (USD)")).toHaveCount(0);
  await f.page.getByRole("link", { name: "This month", exact: true }).click();
  await expect(
    f.page
      .getByRole("form", { name: "Choose budget month" })
      .getByLabel("Month", { exact: true }),
  ).toHaveValue(current);
  await f.page.getByRole("link", { name: "Next month", exact: true }).click();
  await expect(
    f.page.getByText("Planning for next month.", { exact: false }),
  ).toBeVisible();
  await f.page.getByRole("button", { name: "Copy previous month" }).click();
  await expect(figure(card(f.page, "Dining"), "Allocation")).toHaveText(
    "$120.00",
  );
  await expect(figure(card(f.page), "Actual spending")).toHaveText("$0.00");
  await expect(
    f.page.getByRole("link", { name: "Next month", exact: true }),
  ).toHaveCount(0);
  const saved = await pool.query(
    `SELECT month,count(*) FROM budget WHERE workspace_id=$1 GROUP BY month ORDER BY month`,
    [f.workspaceId],
  );
  expect(saved.rows.map((r) => [r.month, Number(r.count)])).toEqual(
    [selected(-1), current, selected(1)].map((m) => [m, 2]),
  );
});

test("uses the full month's ledger across pages and can inspect a year of historical activity", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  await pool.query(
    `INSERT INTO "transaction" (id,workspace_id,financial_account_id,posted_on,amount_cents,description_raw,source,fingerprint,category_id,category_is_manual) SELECT gen_random_uuid()::text,$1,$2,$3,-100,'Market','csv',n::text,$4,true FROM generate_series(1,620) n`,
    [f.workspaceId, f.accountId, date(0), f.key("groceries")],
  );
  for (let offset = -12; offset < 0; offset++)
    await activity(f, -90000, f.key("groceries"), { date: date(offset) });
  await f.page.reload();
  await expect(figure(card(f.page), "Spent")).toHaveText("$620.00");
  await chooseMonth(f.page, selected(-12));
  await expect(figure(card(f.page), "Spent")).toHaveText("$900.00");
  await expect(f.page.getByLabel("Monthly allocation (USD)")).toHaveCount(0);
  await f.page.getByRole("link", { name: "This month", exact: true }).click();
  await expect(figure(card(f.page), "Spent")).toHaveText("$620.00");
});

test("recalculates automatic categories after rule changes while preserving manual choices and renamed categories", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  await activity(f, -1000, f.key("groceries"), { manual: false });
  await activity(f, -2000);
  await f.page.reload();
  await expect(figure(card(f.page), "Spent")).toHaveText("$20.00");
  await pool.query(
    `INSERT INTO category_rule (id,workspace_id,category_id,pattern,match_type,priority) VALUES ($1,$2,$3,'Market','exact',100)`,
    [crypto.randomUUID(), f.workspaceId, f.key("dining")],
  );
  await pool.query(
    `UPDATE category SET name='Food at home' WHERE workspace_id=$1 AND id=$2`,
    [f.workspaceId, f.key("groceries")],
  );
  await f.page.reload();
  await expect(figure(card(f.page, "Dining"), "Spent")).toHaveText("$10.00");
  await expect(figure(card(f.page, "Food at home"), "Spent")).toHaveText(
    "$20.00",
  );
  await allocate(f.page, "50", "Food at home");
  await expect(figure(card(f.page, "Food at home"), "Remaining")).toHaveText(
    "$30.00",
  );
});

test("viewers can inspect plans without mutation and outsiders see no workspace data", async ({
  browser,
  baseURL,
}) => {
  const owner = await fixture(browser, baseURL);
  await activity(owner, -32000);
  await owner.page.reload();
  await allocate(owner.page, "500");
  await expect(figure(card(owner.page), "Allocation")).toHaveText("$500.00");
  const viewer = await signUp(browser, baseURL);
  await pool.query(
    `INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'viewer',now())`,
    [crypto.randomUUID(), owner.workspaceId, viewer.userId],
  );
  const before = await pool.query(
    `SELECT * FROM budget WHERE workspace_id=$1 ORDER BY id`,
    [owner.workspaceId],
  );
  const view = await watch(viewer.context);
  await view.goto(`/w/${owner.workspaceId}/budgets`);
  await expect(figure(card(view), "Remaining")).toHaveText("$180.00");
  await expect(
    view.getByText("You have read-only access to this workspace."),
  ).toBeVisible();
  await expect(view.getByLabel("Monthly allocation (USD)")).toHaveCount(0);
  await expect(
    view.getByRole("button", { name: "Copy previous month" }),
  ).toHaveCount(0);
  expect(
    (
      await pool.query(
        `SELECT * FROM budget WHERE workspace_id=$1 ORDER BY id`,
        [owner.workspaceId],
      )
    ).rows,
  ).toEqual(before.rows);
  const outsider = await signUp(browser, baseURL);
  const foreign = await watch(outsider.context);
  await foreign.goto(`/w/${owner.workspaceId}/budgets`);
  await expect(
    foreign.getByText("This page could not be found."),
  ).toBeVisible();
  await expect(foreign.getByRole("article")).toHaveCount(0);
  await expect(totals(foreign)).toHaveCount(0);
});

test("a failed read shows a retry state without zero totals and recovers without crashing navigation", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  const broken = await activity(f, -(Number.MAX_SAFE_INTEGER + 1));
  expectedFailure.add(f.page);
  await f.page.reload();
  await expect(f.page.getByRole("main").getByRole("alert")).toHaveText(
    "Budgets are temporarily unavailable. Please try again.",
  );
  await expect(totals(f.page)).toHaveCount(0);
  await expect(
    f.page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await pool.query(
    `UPDATE "transaction" SET amount_cents=-1234 WHERE id=$1 AND workspace_id=$2`,
    [broken, f.workspaceId],
  );
  await hydrated(f.page, "main button");
  await f.page.getByRole("button", { name: "Try again" }).click();
  await expect(figure(card(f.page), "Spent")).toHaveText("$12.34");
  expectedFailure.delete(f.page);
  await f.page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name: "Accounts", exact: true })
    .click();
  await expect(
    f.page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
});

test("supports keyboard input, mobile widths, light/dark themes and reduced motion", async ({
  browser,
  baseURL,
}) => {
  const f = await fixture(browser, baseURL);
  await f.page.setViewportSize({ width: 360, height: 800 });
  await f.page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await activity(f, -32000);
  await f.page.reload();
  await hydrated(f.page, "main form button");
  const input = card(f.page).getByLabel("Monthly allocation (USD)");
  await input.focus();
  await input.fill("500");
  await input.press("Enter");
  await expect(figure(card(f.page), "Remaining")).toHaveText("$180.00");
  await expect(card(f.page).getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "$320.00 spent of $500.00",
  );
  await mkdir("docs/screenshots/budgets", { recursive: true });
  for (const [size, width] of [
    ["phone", 360],
    ["desktop", 1440],
  ] as const) {
    await f.page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await f.page.emulateMedia({
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      await f.page.evaluate(async () => {
        window.scrollTo(0, 0);
        await document.fonts.ready;
      });
      expect(
        await f.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(
        await f.page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      ).toBe(true);
      await f.page.screenshot({
        path: `docs/screenshots/budgets/${size}-${theme}.png`,
        fullPage: true,
      });
    }
  }
});
