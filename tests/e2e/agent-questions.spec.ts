import {
  type Browser,
  type Locator,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// F-28 (ADR-059): a linked phone asks about a category's budget, an account
// and upcoming bills, and the figures in the replies are the ones the
// website shows. The phone's texts are posted to /api/agent/turn as the
// worker would send them, with the service token from playwright.config.ts.
// No model is called under test (ADR-059), so each reply is the one code
// builds from the question's words.

const SERVICE_TOKEN = "e2e-only-agent-service-token-0123456789";

async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Question Tester",
    email: `e2e-questions-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

async function addAccount(
  page: Page,
  account: { type?: string; nickname: string; balance: string },
) {
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Add an account" }).click();
  await hydrated(page, "form select");
  if (account.type) {
    await page.getByLabel("Account type").selectOption({ label: account.type });
  }
  await page
    .getByRole("textbox", { name: "Bank or card issuer", exact: true })
    .fill("Capital One");
  await page
    .getByRole("textbox", { name: "Nickname", exact: true })
    .fill(account.nickname);
  await page
    .getByRole("textbox", { name: /Current balance|Amount owed/ })
    .fill(account.balance);
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/accounts$/);
}

/** Links a new phone to the page's user and returns how to text from it. */
async function linkPhone(page: Page) {
  const handle = `+1${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;
  const text = async (message: string): Promise<string> => {
    const response = await page.request.post("/api/agent/turn", {
      headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
      data: {
        platform: "imessage",
        handle,
        spaceId: `any;-;${handle}`,
        messageId: crypto.randomUUID(),
        text: message,
      },
    });
    expect(response.status()).toBe(200);
    return ((await response.json()) as { reply: string }).reply;
  };

  await page.goto("/settings");
  await hydrated(page, "main button");
  await page.getByRole("button", { name: "Connect iMessage" }).click();
  const instruction = page.getByText(/^LINK \d{3} \d{3}$/);
  await expect(instruction).toBeVisible();
  await text((await instruction.textContent())!);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/^Connected: phone ending/)).toBeVisible();
  return text;
}

const groceries = (page: Page) =>
  page.getByRole("article", { name: "Groceries", exact: true });

/** One figure on a Budgets page card, as the page prints it. */
const figure = (article: Locator, label: string) =>
  article
    .locator("dl > div")
    .filter({ has: article.page().getByText(label, { exact: true }) })
    .locator("dd");

async function openBudgets(page: Page) {
  await page.goto("/budgets");
  await expect(groceries(page)).toBeVisible();
  await hydrated(page, "main form button");
}

test("a text asks what is left of a budget and gets the Budgets page's figures", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });

  await openBudgets(page);
  await groceries(page).getByLabel("Monthly allocation (USD)").fill("200");
  await groceries(page)
    .getByRole("button", { name: /^(Set|Save) budget$/ })
    .click();
  await expect(figure(groceries(page), "Allocation")).toHaveText("$200.00");

  const text = await linkPhone(page);
  expect(await text("40 groceries")).toContain(
    'Logged $40.00 for "groceries" today, in Groceries.',
  );

  // What the website says now: the reply must say the same.
  await openBudgets(page);
  const card = groceries(page);
  await expect(figure(card, "Spent")).toHaveText("$40.00");
  await expect(figure(card, "Remaining")).toHaveText("$160.00");
  const spent = (await figure(card, "Spent").textContent())!;
  const remaining = (await figure(card, "Remaining").textContent())!;
  const allocation = (await figure(card, "Allocation").textContent())!;

  // A typo in the category's name is still understood.
  const thisMonth = `You've spent ${spent} on Groceries so far this month. You have ${remaining} left of your ${allocation} Groceries budget this month.`;
  expect(await text("whats left in my grocries budget")).toBe(thisMonth);
  // Only this month is known, and the reply says so.
  expect(await text("how much did I spend on groceries last month?")).toBe(
    `I only have this month so far. ${thisMonth}`,
  );

  // The account by its kind, with the balance the log left it at.
  expect(await text("whats in my checking?")).toBe(
    "Your checking account, Everyday, has $460.00.",
  );
  // No payday is confirmed, so there is no "before payday" to list.
  expect(await text("what bills are coming up?")).toBe(
    "Confirm your payday on the website's Recurring payments page and I can tell you what you can spend a day.",
  );
  // Anything else is still the general summary.
  expect(await text("how am I doing?")).toContain(
    "You have $460.00 in checking and savings.",
  );
});
