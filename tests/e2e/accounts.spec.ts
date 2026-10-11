import { type Browser, type Page, expect, test } from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// F-03 (TEST-07): add each account type, edit, delete with confirmation.
// Each test signs up its own user, so its Personal workspace starts empty.

async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Accounts Tester",
    email: `e2e-accounts-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

type NewAccount = {
  type: string;
  institution: string;
  nickname: string;
  last4?: string;
  balance: string;
};

async function addAccount(page: Page, account: NewAccount): Promise<void> {
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Add an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Add an account" }),
  ).toBeVisible();
  await hydrated(page, "form select");

  await page
    .getByRole("combobox", { name: "Account type" })
    .selectOption({ label: account.type });
  await field(page, "Bank or card issuer").fill(account.institution);
  await field(page, "Nickname").fill(account.nickname);
  if (account.last4) {
    await field(page, "Last 4 digits (optional)").fill(account.last4);
  }
  const owed = account.type === "Credit card" || account.type === "Loan";
  await field(page, owed ? "Amount owed" : "Current balance").fill(
    account.balance,
  );
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/accounts$/);
}

// By role, so the hidden copy Next keeps of the previous page never matches.
const field = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true });

const row = (page: Page, nickname: string) =>
  page.getByRole("listitem").filter({ hasText: nickname });

test("starts empty, then lists each account type with its balance", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await page.goto("/accounts");
  await expect(page.getByText("No accounts yet.")).toBeVisible();

  await addAccount(page, {
    type: "Checking",
    institution: "Capital One",
    nickname: "Everyday",
    last4: "1234",
    balance: "1,204.50",
  });
  await addAccount(page, {
    type: "Savings",
    institution: "Capital One",
    nickname: "Rainy day",
    balance: "500",
  });
  await addAccount(page, {
    type: "Credit card",
    institution: "Capital One",
    nickname: "Quicksilver",
    balance: "300",
  });
  await addAccount(page, {
    type: "Loan",
    institution: "State Employees CU",
    nickname: "Car loan",
    balance: "8,000",
  });

  for (const heading of ["Checking", "Savings", "Credit card", "Loan"]) {
    await expect(
      page.getByRole("heading", { level: 2, name: heading }),
    ).toBeVisible();
  }
  await expect(row(page, "Everyday")).toContainText("Balance $1,204.50");
  await expect(row(page, "Everyday")).toContainText("ending in 1234");
  await expect(row(page, "Rainy day")).toContainText("Balance $500.00");
  // Owed amounts are labelled in words, not only by colour or sign.
  await expect(row(page, "Quicksilver")).toContainText("Owed $300.00");
  await expect(row(page, "Car loan")).toContainText("Owed $8,000.00");
});

test("explains a bad entry beside the field and keeps what was typed", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Add an account" }).click();
  await hydrated(page, "form select");

  await field(page, "Bank or card issuer").fill("Capital One");
  await field(page, "Nickname").fill("Everyday");
  await field(page, "Last 4 digits (optional)").fill("4111111111111111");
  await field(page, "Current balance").fill("lots");
  await page.getByRole("button", { name: "Add account" }).click();

  await expect(
    page.getByText("Enter only the last 4 digits, or leave it blank."),
  ).toBeVisible();
  await expect(page.getByText("Enter an amount like 1,204.50.")).toBeVisible();
  await expect(field(page, "Nickname")).toHaveValue("Everyday");
  await expect(page).toHaveURL(/\/accounts\/new$/);
});

test("edits an account, then deletes it after confirming", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, {
    type: "Checking",
    institution: "Capital One",
    nickname: "Old name",
    balance: "100",
  });

  await page.getByRole("link", { name: "Edit Old name" }).click();
  await hydrated(page, "form select");
  await expect(field(page, "Current balance")).toHaveValue("$100.00");
  await field(page, "Nickname").fill("Bills account");
  await field(page, "Current balance").fill("-35.10");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/w\/[^/]+\/accounts$/);
  await expect(row(page, "Bills account")).toContainText("Balance -$35.10");

  await page.getByRole("link", { name: "Edit Bills account" }).click();
  await hydrated(page, "form select");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(
    page.getByText("Its transactions are deleted with it."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(
    page.getByRole("button", { name: "Delete account" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page).toHaveURL(/\/w\/[^/]+\/accounts$/);
  await expect(page.getByText("No accounts yet.")).toBeVisible();
});

test("another user's account is not found", async ({ browser, baseURL }) => {
  const owner = await newUserPage(browser, baseURL);
  await addAccount(owner, {
    type: "Checking",
    institution: "Capital One",
    nickname: "Private",
    balance: "1",
  });
  await owner.getByRole("link", { name: "Edit Private" }).click();
  await expect(owner).toHaveURL(/\/accounts\/[0-9a-f-]{36}$/);
  const editUrl = owner.url();

  const stranger = await newUserPage(browser, baseURL);
  await stranger.goto(editUrl);

  await expect(
    stranger.getByText("This page could not be found."),
  ).toBeVisible();
  await expect(stranger.getByText("Private")).toHaveCount(0);
});
