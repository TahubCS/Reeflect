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

// Real browser + real local PostgreSQL. Fixtures enter transactions as an
// importer would; categorization and all corrections use the production UI.
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5433/app_test",
  max: 2,
});
const userIds: string[] = [];
const contexts: BrowserContext[] = [];
const pageErrors: string[] = [];
let expectServerRenderFailure = false;
const MARKET = "CORNER MARKET STORE #0042 REF ABC123";
const SECOND = "Corner Market #0077";

async function signup(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({
    extraHTTPHeaders: ownClientAddress(),
  });
  contexts.push(context);
  await signUpVerified(context.request, baseURL, {
    name: "Categorization Tester",
    email: `e2e-category-${crypto.randomUUID()}@example.test`,
  });
  const response = await context.request.get("/api/auth/get-session");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  userIds.push(body.user.id);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { page, userId: body.user.id as string };
}

async function transaction(
  workspaceId: string,
  accountId: string,
  description = "Corner Market Store #999 REF XYZ789",
  amountCents = -1234,
) {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "transaction" (id, workspace_id, financial_account_id, posted_on, amount_cents, description_raw, source, fingerprint)
    VALUES ($1, $2, $3, '2026-10-10', $4, $5, 'synthetic', $1)`,
    [id, workspaceId, accountId, amountCents, description],
  );
  return id;
}

async function fixture(
  browser: Browser,
  baseURL: string | undefined,
  seed = true,
) {
  const { page, userId } = await signup(browser, baseURL);
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/w\/[^/]+\/transactions$/);
  await expect(
    page.getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();
  const workspaceId = new URL(page.url()).pathname.split("/")[2]!;
  const accountId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO financial_account (id, workspace_id, institution_name, type, nickname, source, current_balance_cents)
    VALUES ($1, $2, 'Synthetic bank', 'checking', 'Everyday', 'synthetic', 12345)`,
    [accountId, workspaceId],
  );
  if (seed) {
    await transaction(workspaceId, accountId, MARKET);
    await transaction(workspaceId, accountId, SECOND, -2500);
    await transaction(workspaceId, accountId, "City Transit", -500);
  }
  await page.reload();
  return { page, userId, workspaceId, accountId };
}

const row = (page: Page, name: string) =>
  page
    .getByRole("region", { name: "Your transactions" })
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
const rules = (page: Page) =>
  page.getByRole("region", { name: "Categorization rules" });
const savedRule = (page: Page, pattern: string) =>
  rules(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(pattern, { exact: true }) });
async function open(summary: Locator) {
  if (
    !(await summary.evaluate((node) =>
      node.closest("details")?.hasAttribute("open"),
    ))
  )
    await summary.click();
}

async function override(page: Page, merchant = MARKET) {
  const item = row(page, merchant);
  await open(item.getByText("Change category", { exact: true }));
  await hydrated(page, "details[open] form select");
  return item.getByRole("form");
}

async function addRule(
  page: Page,
  pattern: string,
  category: string,
  matchType = "contains",
  priority = "100",
) {
  await open(rules(page).getByText("Add a rule", { exact: true }));
  await hydrated(page, "details[open] form select");
  const form = page.getByRole("form", { name: "Add rule", exact: true });
  await form.getByRole("textbox", { name: "Merchant keyword" }).fill(pattern);
  await form
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: category });
  await form
    .getByRole("combobox", { name: "Match type" })
    .selectOption(matchType);
  await form.getByRole("spinbutton", { name: "Priority" }).fill(priority);
  await form.getByRole("button", { name: "Add rule", exact: true }).click();
  await expect(rules(page).getByText(pattern, { exact: true })).toBeVisible();
}

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  for (const id of userIds.splice(0)) {
    await pool.query(
      `DELETE FROM organization WHERE id IN (SELECT organization_id FROM member WHERE user_id = $1)`,
      [id],
    );
    await pool.query(`DELETE FROM "user" WHERE id = $1`, [id]);
  }
  const errors = pageErrors.splice(0);
  const injectedFailure = expectServerRenderFailure;
  expectServerRenderFailure = false;
  // React can report its recoverable SSR failure after the boundary's retry.
  // Only the deliberate failed-load test allows this exact framework error;
  // every unexpected error, and every error in normal flows, still fails.
  if (injectedFailure) {
    for (const message of errors)
      expect(message).toMatch(/^Minified React error #419;/);
  } else {
    expect(errors).toEqual([]);
  }
});
test.afterAll(() => pool.end());

test("manual override can become a rule for existing and later matching transactions", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, accountId } = await fixture(browser, baseURL);
  await expect(row(page, MARKET)).toContainText("Uncategorized");
  await expect(row(page, SECOND)).toContainText("Uncategorized");
  const form = await override(page);
  await form
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Groceries" });
  await form.getByRole("checkbox", { name: "Also save a rule" }).check();
  await expect(
    form.getByRole("textbox", { name: "Merchant keyword" }),
  ).toHaveValue("corner market");
  await form.getByRole("button", { name: "Save category" }).click();
  await expect(row(page, MARKET)).toContainText("Groceries");
  await expect(row(page, MARKET)).toContainText("Manual choice");
  await expect(row(page, SECOND)).toContainText("Groceries");
  await expect(row(page, SECOND)).toContainText("Automatic rule");
  await expect(row(page, "City Transit")).toContainText("Uncategorized");
  await expect(row(page, MARKET)).toContainText("−$12.34");
  const later = "Corner Market Store #999 REF XYZ789";
  await transaction(workspaceId, accountId, later);
  await page.reload();
  await expect(row(page, later)).toContainText("Groceries");
  await expect(row(page, later)).toContainText("Automatic rule");
  expect(
    (
      await pool.query(
        `SELECT current_balance_cents FROM financial_account WHERE id = $1`,
        [accountId],
      )
    ).rows[0].current_balance_cents,
  ).toBe("12345");
});

test("a saved rule categorizes transactions created through the app and manual choices survive edits", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL, false);
  await addRule(page, "corner market", "Groceries", "exact");
  await page
    .getByRole("link", { name: "Add a transaction", exact: true })
    .click();
  await hydrated(page, "form select");
  await page
    .getByRole("textbox", { name: "Amount", exact: true })
    .fill("12.34");
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Corner Market #4321");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(row(page, "Corner Market #4321")).toContainText("Groceries");
  await expect(row(page, "Corner Market #4321")).toContainText(
    "Automatic rule",
  );
  await expect(row(page, "Corner Market #4321")).toContainText("−$12.34");
  const correction = await override(page, "Corner Market #4321");
  await correction
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Dining" });
  await correction.getByRole("button", { name: "Save category" }).click();
  await expect(row(page, "Corner Market #4321")).toContainText("Manual choice");
  await page
    .getByRole("link", { name: "Edit Corner Market #4321", exact: true })
    .click();
  await hydrated(page, "form select");
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Different merchant");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(row(page, "Different merchant")).toContainText("Dining");
  await expect(row(page, "Different merchant")).toContainText("Manual choice");
});

test("manual choices including Uncategorized survive rule edits and can return to automatic", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL);
  await addRule(page, "market", "Groceries");
  let form = await override(page);
  await form
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("");
  await expect(
    form.getByRole("checkbox", { name: "Also save a rule" }),
  ).toBeDisabled();
  await form.getByRole("button", { name: "Save category" }).click();
  await expect(row(page, MARKET)).toContainText("Manual choice");
  await expect(row(page, MARKET)).toContainText("Uncategorized");
  await addRule(page, "corner market", "Dining", "exact", "200");
  await expect(row(page, MARKET)).toContainText("Uncategorized");
  await expect(row(page, SECOND)).toContainText("Dining");
  form = await override(page);
  await form
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("automatic");
  await form.getByRole("button", { name: "Save category" }).click();
  await expect(row(page, MARKET)).toContainText("Dining");
  await expect(row(page, MARKET)).toContainText("Automatic rule");
});

test("edits rule priority and category, then deletes it with confirmation", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL);
  await addRule(page, "market", "Groceries", "contains", "50");
  await addRule(page, "corner market", "Dining", "exact", "100");
  await expect(row(page, SECOND)).toContainText("Dining");
  await open(
    savedRule(page, "corner market").getByText("Edit rule for corner market", {
      exact: true,
    }),
  );
  await hydrated(page, "details[open] form select");
  let form = savedRule(page, "corner market").getByRole("form", {
    name: "Save rule",
    exact: true,
  });
  await form
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Shopping" });
  await form.getByRole("spinbutton", { name: "Priority" }).fill("25");
  await form.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(row(page, SECOND)).toContainText("Groceries");
  await open(
    savedRule(page, "market").getByText("Edit rule for market", {
      exact: true,
    }),
  );
  await hydrated(page, "details[open] form select");
  await savedRule(page, "market")
    .getByRole("button", { name: "Delete rule", exact: true })
    .click();
  await savedRule(page, "market")
    .getByRole("button", { name: "Keep rule", exact: true })
    .click();
  await savedRule(page, "market")
    .getByRole("button", { name: "Delete rule", exact: true })
    .click();
  await savedRule(page, "market")
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(row(page, SECOND)).toContainText("Shopping");
  await open(
    savedRule(page, "corner market").getByText("Edit rule for corner market", {
      exact: true,
    }),
  );
  form = savedRule(page, "corner market").getByRole("form", {
    name: "Save rule",
    exact: true,
  });
  await expect(
    form
      .getByRole("combobox", { name: "Category", exact: true })
      .locator("option:checked"),
  ).toHaveText("Shopping");
  await savedRule(page, "corner market")
    .getByRole("button", { name: "Delete rule", exact: true })
    .click();
  await savedRule(page, "corner market")
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(row(page, SECOND)).toContainText("Uncategorized");
});

test("invalid rule input reports an error and retains what was typed", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL);
  await rules(page).getByText("Add a rule", { exact: true }).click();
  await hydrated(page, "details[open] form select");
  const form = page.getByRole("form", { name: "Add rule", exact: true });
  await form
    .getByRole("textbox", { name: "Merchant keyword" })
    .fill("REF ABC123");
  await form
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Groceries" });
  await form.getByRole("button", { name: "Add rule", exact: true }).click();
  await expect(
    form.getByText(
      "Enter a merchant keyword, not just a store or reference number.",
    ),
  ).toBeVisible();
  await expect(
    form.getByRole("textbox", { name: "Merchant keyword" }),
  ).toHaveValue("REF ABC123");
  await expect(rules(page).getByText("No saved rules yet.")).toBeVisible();
});

test("category renames persist and appear on rules and transactions", async ({
  browser,
  baseURL,
}) => {
  const { page } = await fixture(browser, baseURL);
  await addRule(page, "market", "Groceries");
  const categories = page.getByRole("region", {
    name: "Categories",
    exact: true,
  });
  await categories.getByText("Groceries", { exact: true }).click();
  await hydrated(page, "details[open] form input");
  let form = page.getByRole("form", { name: "Rename Groceries", exact: true });
  await form.getByRole("textbox", { name: "Category name" }).fill("Food shop");
  await form.getByRole("button", { name: "Rename category" }).click();
  await expect(row(page, SECOND)).toContainText("Food shop");
  await expect(rules(page)).toContainText("Food shop");
  await page.reload();
  await categories.getByText("Food shop", { exact: true }).click();
  form = page.getByRole("form", { name: "Rename Food shop", exact: true });
  await form.getByRole("textbox", { name: "Category name" }).fill("Dining");
  await form.getByRole("button", { name: "Rename category" }).click();
  await expect(
    form.getByText("A category already has this name."),
  ).toBeVisible();
  await expect(
    form.getByRole("textbox", { name: "Category name" }),
  ).toHaveValue("Dining");
});

test("viewer sees categories without edit controls and a stranger cannot read the workspace", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, userId } = await fixture(browser, baseURL);
  await addRule(page, "market", "Groceries");
  await pool.query(
    `UPDATE member SET role = 'viewer' WHERE organization_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );
  await page.reload();
  await expect(
    page.getByText("You have view-only access.", { exact: false }),
  ).toBeVisible();
  await expect(row(page, SECOND)).toContainText("Groceries");
  await expect(page.getByText("Change category", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Add a rule", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Rename category" }),
  ).toHaveCount(0);
  const stranger = await signup(browser, baseURL);
  await stranger.page.goto(`/w/${workspaceId}/transactions`);
  await expect(
    stranger.page.getByText("This page could not be found."),
  ).toBeVisible();
  await expect(stranger.page.getByText(MARKET, { exact: true })).toHaveCount(0);
});

test("a viewer's first visit does not initialize or mutate categories", async ({
  browser,
  baseURL,
}) => {
  const { page, userId } = await signup(browser, baseURL);
  const workspaceId = (
    await pool.query(`SELECT organization_id FROM member WHERE user_id = $1`, [
      userId,
    ])
  ).rows[0].organization_id as string;
  await pool.query(
    `UPDATE member SET role = 'viewer' WHERE organization_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );
  await page.goto(`/w/${workspaceId}/transactions`);
  await expect(
    page.getByText(
      "An editor or owner can open this page to set up the workspace’s categories.",
    ),
  ).toBeVisible();
  expect(
    (
      await pool.query(
        `SELECT count(*)::int AS count FROM category WHERE workspace_id = $1`,
        [workspaceId],
      )
    ).rows[0].count,
  ).toBe(0);
  await pool.query(
    `UPDATE member SET role = 'editor' WHERE organization_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Categories", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(18); // The presets (ADR-056).
});

test("an exact rule matches store numbers followed by city and state", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, accountId } = await fixture(
    browser,
    baseURL,
    false,
  );
  await transaction(workspaceId, accountId, "WALMART #1234 RALEIGH NC");
  await page.reload();
  await addRule(page, "walmart", "Groceries", "exact");
  await expect(row(page, "WALMART #1234 RALEIGH NC")).toContainText(
    "Groceries",
  );
  await transaction(workspaceId, accountId, "WALMART #5678 DURHAM NC 27701");
  await page.reload();
  await expect(row(page, "WALMART #5678 DURHAM NC 27701")).toContainText(
    "Groceries",
  );
});

test("empty and paginated states work without a page error", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, accountId } = await fixture(
    browser,
    baseURL,
    false,
  );
  await expect(page.getByText(/^No transactions yet\./)).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Categories", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(18); // The presets (ADR-056).
  for (let index = 0; index < 51; index++)
    await transaction(workspaceId, accountId, `Merchant ${index}`);
  await page.reload();
  const list = page.getByRole("region", { name: "Your transactions" });
  await expect(list.getByRole("listitem")).toHaveCount(50);
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("link", { name: "Previous page" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(50);
  await page.goto(`/w/${workspaceId}/transactions?page=broken`);
  await expect(list.getByRole("listitem")).toHaveCount(50);
});

test("forms stay usable at 360px in the dark theme with reduced motion", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, accountId } = await fixture(browser, baseURL);
  await transaction(workspaceId, accountId, "X".repeat(2001));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.reload();
  const form = await override(page);
  await form
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Groceries" });
  await form.getByRole("checkbox", { name: "Also save a rule" }).check();
  await expect(
    form.getByRole("textbox", { name: "Merchant keyword" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await form.getByRole("button", { name: "Save category" }).click();
  await expect(row(page, MARKET)).toContainText("Groceries");
});

test("a failed transaction load can recover and leaves the rest of the app available", async ({
  browser,
  baseURL,
}) => {
  const { page, workspaceId, accountId } = await fixture(browser, baseURL);
  expect(pageErrors.splice(0)).toEqual([]);
  expectServerRenderFailure = true;
  const id = await transaction(
    workspaceId,
    accountId,
    "Invalid amount fixture",
    Number.MAX_SAFE_INTEGER + 1,
  );
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Transactions are temporarily unavailable. Please try again.",
  );
  await hydrated(page, "main button");
  await pool.query(
    `UPDATE "transaction" SET amount_cents = -1234 WHERE id = $1`,
    [id],
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(row(page, "Invalid amount fixture")).toContainText("−$12.34");
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name: "Accounts", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("listitem")
      .filter({ has: page.getByText("Everyday", { exact: true }) }),
  ).toBeVisible();
});
