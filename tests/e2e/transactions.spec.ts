import { type Browser, type Page, expect, test } from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// F-04 (TEST-07): add, edit and delete a transaction by hand, and see the
// account balance follow (ADR-050). Each test signs up its own user, so its
// Personal workspace starts empty.

async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Transactions Tester",
    email: `e2e-transactions-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

// By role, so the hidden copy Next keeps of the previous page never matches.
const field = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true });

const row = (page: Page, text: string) =>
  page.getByRole("listitem").filter({ hasText: text });

async function addChecking(page: Page, nickname: string, balance: string) {
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Add an account" }).click();
  await hydrated(page, "form select");
  await field(page, "Bank or card issuer").fill("Capital One");
  await field(page, "Nickname").fill(nickname);
  await field(page, "Current balance").fill(balance);
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/accounts$/);
}

async function openAddForm(page: Page) {
  await page.goto("/transactions");
  await page.getByRole("link", { name: "Add a transaction" }).click();
  await expect(
    page.getByRole("heading", { name: "Add a transaction" }),
  ).toBeVisible();
  await hydrated(page, "form select");
}

test("asks for an account before any transaction", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await page.goto("/transactions");

  await expect(
    page.getByText("Add an account first, then its transactions."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add a transaction" }),
  ).toHaveCount(0);
});

test("adds, edits and deletes a transaction; the balance follows", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addChecking(page, "Everyday", "100");

  await openAddForm(page);
  await field(page, "Amount").fill("12.50");
  await field(page, "Description").fill("Lunch");
  await page.getByRole("button", { name: "Add transaction" }).click();

  await expect(page).toHaveURL(/\/w\/[^/]+\/transactions$/);
  await expect(row(page, "Lunch")).toContainText("Everyday");
  // The sign is text, not only colour.
  await expect(row(page, "Lunch")).toContainText("Money out, −$12.50");

  // Dated today, the day the balance was typed, so it moves the balance.
  await page.goto("/accounts");
  await expect(row(page, "Everyday")).toContainText("Balance $87.50");

  await page.goto("/transactions");
  await page.getByRole("link", { name: "Edit Lunch" }).click();
  await hydrated(page, "form select");
  await expect(field(page, "Amount")).toHaveValue("$12.50");
  await page.getByRole("radio", { name: "Money in" }).check();
  await field(page, "Amount").fill("20");
  await field(page, "Description").fill("Refund");
  await page.getByRole("checkbox", { name: "Still pending" }).check();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/w\/[^/]+\/transactions$/);
  await expect(row(page, "Refund")).toContainText("+$20.00");
  await expect(row(page, "Refund")).toContainText("Pending");
  await page.goto("/accounts");
  await expect(row(page, "Everyday")).toContainText("Balance $120.00");

  await page.goto("/transactions");
  await page.getByRole("link", { name: "Edit Refund" }).click();
  await hydrated(page, "form select");
  await page.getByRole("button", { name: "Delete transaction" }).click();
  await page.getByRole("button", { name: "Keep it" }).click();
  await page.getByRole("button", { name: "Delete transaction" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page).toHaveURL(/\/w\/[^/]+\/transactions$/);
  await expect(page.getByText("No transactions yet.")).toBeVisible();
  await page.goto("/accounts");
  await expect(row(page, "Everyday")).toContainText("Balance $100.00");
});

test("explains a bad entry beside the field and keeps what was typed", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addChecking(page, "Everyday", "100");

  await openAddForm(page);
  await field(page, "Amount").fill("lots");
  await field(page, "Description").fill("Groceries");
  await page.getByRole("button", { name: "Add transaction" }).click();

  await expect(
    page.getByText("Enter an amount above zero, like 12.50."),
  ).toBeVisible();
  await expect(field(page, "Description")).toHaveValue("Groceries");
  await expect(page).toHaveURL(/\/transactions\/new$/);
});

test("filters the list to one account", async ({ browser, baseURL }) => {
  const page = await newUserPage(browser, baseURL);
  await addChecking(page, "Everyday", "100");
  await addChecking(page, "Bills", "500");

  for (const [account, description] of [
    ["Everyday", "Coffee"],
    ["Bills", "Electric"],
  ] as const) {
    await openAddForm(page);
    await page
      .getByRole("combobox", { name: "Account" })
      .selectOption({ label: account });
    await field(page, "Amount").fill("4");
    await field(page, "Description").fill(description);
    await page.getByRole("button", { name: "Add transaction" }).click();
    await expect(page).toHaveURL(/\/w\/[^/]+\/transactions$/);
  }

  await page
    .getByRole("combobox", { name: "Account" })
    .selectOption({ label: "Bills" });
  await page.getByRole("button", { name: "Show" }).click();

  await expect(page).toHaveURL(/\?account=[0-9a-f-]{36}$/);
  await expect(row(page, "Electric")).toBeVisible();
  await expect(row(page, "Coffee")).toHaveCount(0);
  // Adding from the filtered list: Cancel keeps the filter, but the hint's
  // links go to Review transfers and Bills themselves.
  await page.getByRole("link", { name: "Add a transaction" }).click();
  await expect(page).toHaveURL(/\/transactions\/new\?account=/);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: "Review transfers" }),
  ).toHaveAttribute("href", /\/w\/[^/]+\/transactions\/transfers$/);
  await expect(main.getByRole("link", { name: "Bills" })).toHaveAttribute(
    "href",
    /\/w\/[^/]+\/bills$/,
  );
  await expect(page.getByRole("link", { name: "Cancel" })).toHaveAttribute(
    "href",
    /\/transactions\?account=[0-9a-f-]{36}$/,
  );
});

test("another user's transaction is not found", async ({
  browser,
  baseURL,
}) => {
  const owner = await newUserPage(browser, baseURL);
  await addChecking(owner, "Everyday", "100");
  await openAddForm(owner);
  await field(owner, "Amount").fill("9");
  await field(owner, "Description").fill("Private");
  await owner.getByRole("button", { name: "Add transaction" }).click();
  await owner.getByRole("link", { name: "Edit Private" }).click();
  await expect(owner).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);
  const editUrl = owner.url();

  const stranger = await newUserPage(browser, baseURL);
  await stranger.goto(editUrl);

  await expect(
    stranger.getByText("This page could not be found."),
  ).toBeVisible();
  await expect(stranger.getByText("Private")).toHaveCount(0);
});
