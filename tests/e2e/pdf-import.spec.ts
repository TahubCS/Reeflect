import { type Browser, type Page, expect, test } from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// F-06 (TEST-07): import a Capital One statement PDF. The fixtures are
// synthetic (tests/fixtures/pdf/specs.ts). Each test signs up its own user,
// so its Personal workspace starts empty.

const FIXTURES = "tests/fixtures/pdf";

async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Import Tester",
    email: `e2e-import-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

const field = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true });

async function addAccount(page: Page, last4: string) {
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Add an account" }).click();
  await hydrated(page, "form select");
  await field(page, "Bank or card issuer").fill("Capital One");
  await field(page, "Nickname").fill("Everyday");
  await field(page, "Last 4 digits (optional)").fill(last4);
  await field(page, "Current balance").fill("100");
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

test("previews, checks and imports a statement", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, "1234");
  await upload(page, "capital-one-normal.pdf");

  await expect(page).toHaveURL(/\/import\?batch=/);
  await expect(check(page, "Balances add up")).toContainText("Passed");
  await expect(check(page, "Saved copy matches")).toContainText(
    "All 11 rows read back",
  );
  await expect(
    page.getByRole("cell", { name: "Rent Payment, Unit 4B" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "−$1,200.00" })).toBeVisible();

  await hydrated(page, "form input[type=checkbox]");
  await page.getByRole("button", { name: "Import 11 transactions" }).click();
  await expect(alert(page)).toContainText(
    "Confirm it is for Capital One ••1234",
  );

  await page
    .getByRole("checkbox", { name: /I confirm it is for Capital One ••1234/ })
    .check();
  await page.getByRole("button", { name: "Import 11 transactions" }).click();

  await expect(page).toHaveURL(/\/transactions\?account=/);
  await expect(
    page.getByRole("listitem").filter({ hasText: "Rent Payment, Unit 4B" }),
  ).toBeVisible();
});

test("blocks a statement for a different account", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, "9999");
  await upload(page, "capital-one-normal.pdf");

  await expect(alert(page)).toHaveText(
    "This statement covers ••1234, but the chosen account ends in 9999. Choose the matching account.",
  );
});

test("fails clearly on a bank it can't read", async ({ browser, baseURL }) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, "1234");
  await upload(page, "other-bank.pdf");

  await expect(alert(page)).toHaveText(
    "Only Capital One 360 statements can be read for now.",
  );
});

test("shows the difference when a statement is off by a cent, and imports nothing", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, "1234");
  await upload(page, "capital-one-off-by-a-cent.pdf");

  await expect(
    page.getByRole("heading", {
      name: "This statement can’t be imported as it is",
    }),
  ).toBeVisible();
  await expect(check(page, "Balances add up")).toContainText(
    "Stops the import",
  );
  await expect(check(page, "Balances add up")).toContainText(
    "a difference of $0.01",
  );
  await expect(page.getByRole("button", { name: /^Import/ })).toHaveCount(0);
});

test("keeps a preview waiting until it is discarded", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, "1234");
  await upload(page, "capital-one-normal.pdf");
  await expect(page).toHaveURL(/\/import\?batch=/);

  await page.goto("/import");
  const waiting = page.getByRole("region", { name: "Waiting for you" });
  await expect(waiting).toContainText("Everyday ••1234 (360 Checking, PDF)");
  await waiting.getByRole("link", { name: "Review" }).click();
  await hydrated(page, "form button");
  // Discarding deletes the saved copy, so it asks once more.
  await page.getByText("Discard", { exact: true }).click();
  await page.getByRole("button", { name: "Confirm discard" }).click();

  await expect(page).toHaveURL(/\/w\/[^/]+\/import$/);
  await expect(
    page.getByRole("region", { name: "Waiting for you" }),
  ).toHaveCount(0);
});
