import { type Browser, type Page, expect, test } from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// F-05 (TEST-07): import a Capital One CSV export. The fixtures are
// synthetic (tests/fixtures/csv/). Each test signs up its own user, so its
// Personal workspace starts empty.

const FIXTURES = "tests/fixtures/csv";

async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "CSV Import Tester",
    email: `e2e-csv-import-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

const field = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true });

async function addAccount(
  page: Page,
  last4: string,
  type: "Checking" | "Credit card" = "Checking",
) {
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Add an account" }).click();
  await hydrated(page, "form select");
  await page.getByLabel("Account type").selectOption({ label: type });
  await field(page, "Bank or card issuer").fill("Capital One");
  await field(page, "Nickname").fill("Everyday");
  await field(page, "Last 4 digits (optional)").fill(last4);
  await field(
    page,
    type === "Credit card" ? "Amount owed" : "Current balance",
  ).fill("100");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/accounts$/);
}

async function upload(page: Page, file: string) {
  await page.goto("/import");
  await hydrated(page, "form select");
  await page
    .getByLabel("Statement (PDF or CSV)")
    .setInputFiles(`${FIXTURES}/${file}`);
  await page.getByRole("button", { name: "Read statement" }).click();
}

// Inside <main>: Next keeps an empty role="alert" route announcer of its own.
const alert = (page: Page) => page.getByRole("main").getByRole("alert");

const check = (page: Page, label: string) =>
  page
    .getByRole("list", { name: "Checks" })
    .getByRole("listitem")
    .filter({ hasText: label });

async function importWithConfirmation(page: Page, rows: number, last4: string) {
  await hydrated(page, "form input[type=checkbox]");
  await page
    .getByRole("checkbox", {
      name: new RegExp(`I confirm it is for Capital One ••${last4}`),
    })
    .check();
  await page
    .getByRole("button", { name: `Import ${rows} transactions` })
    .click();
  await expect(page).toHaveURL(/\/transactions\?account=/);
}

test("previews, checks and imports a 360 export, then blocks it a second time", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, "1234");
  await upload(page, "capital-one-360-normal.csv");

  await expect(page).toHaveURL(/\/import\?batch=/);
  await expect(check(page, "Balances add up")).toContainText("Passed");
  await expect(check(page, "Each row's balance follows")).toContainText(
    "Passed",
  );
  await expect(check(page, "Saved copy matches")).toContainText(
    "All 5 rows read back",
  );
  await expect(
    page.getByRole("cell", { name: "COFFEE, TEA & MORE" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "−$12.50" })).toBeVisible();

  await importWithConfirmation(page, 5, "1234");
  await expect(
    page.getByRole("listitem").filter({ hasText: "RENT PAYMENT" }),
  ).toBeVisible();

  await upload(page, "capital-one-360-normal.csv");
  await expect(check(page, "Not imported before")).toContainText(
    "Stops the import",
  );
  await expect(page.getByRole("button", { name: /^Import/ })).toHaveCount(0);
});

test("imports a card export that has no balances", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, "5678", "Credit card");
  await upload(page, "capital-one-card.csv");

  await expect(page).toHaveURL(/\/import\?batch=/);
  const summary = page.getByRole("main").locator("dl");
  await expect(summary.getByText("Not in this file")).toHaveCount(2);
  await expect(
    page.getByText("This file has no balances, so there is nothing to add up."),
  ).toBeVisible();
  await expect(check(page, "Balances add up")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Balance" })).toHaveCount(
    0,
  );

  await importWithConfirmation(page, 3, "5678");
  await expect(
    page.getByRole("listitem").filter({ hasText: "AMAZON.COM, INC" }),
  ).toBeVisible();
});

test("blocks an export for a different account", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, "9999");
  await upload(page, "capital-one-360-normal.csv");

  await expect(alert(page)).toHaveText(
    "This CSV covers ••1234, but the chosen account ends in 9999. Choose the matching account.",
  );
});

test("fails clearly on another bank's export", async ({ browser, baseURL }) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, "1234");
  await upload(page, "other-bank.csv");

  await expect(alert(page)).toHaveText(
    "Only Capital One CSV exports can be read for now: 360 checking and savings, and credit cards.",
  );
});
