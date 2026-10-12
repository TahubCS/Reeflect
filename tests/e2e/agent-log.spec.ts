import { type Browser, type Page, expect, test } from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// F-27 (ADR-064): spending logged by text shows on the calendar, and UNDO
// takes it back. The phone's texts are posted to /api/agent/turn as the
// worker would send them, with the service token from playwright.config.ts.
// No model is called under test (ADR-059), so categories come from the rules.

const SERVICE_TOKEN = "e2e-only-agent-service-token-0123456789";

async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Log Tester",
    email: `e2e-log-${crypto.randomUUID()}@example.test`,
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
  const text = async (
    message: string,
    kind?: "attachment" | "voice" | "edit",
  ): Promise<string> => {
    const response = await page.request.post("/api/agent/turn", {
      headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
      data: {
        platform: "imessage",
        handle,
        spaceId: `any;-;${handle}`,
        messageId: crypto.randomUUID(),
        text: message,
        ...(kind ? { kind } : {}),
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

async function openDashboard(page: Page) {
  await page.goto("/dashboard");
  await hydrated(page, "button[data-date]");
}

const headline = (page: Page) => page.getByRole("heading", { level: 1 });
const dayPanel = (page: Page) =>
  page.getByRole("complementary", { name: "Selected day" });

test("a text logs spending onto the calendar, and UNDO takes it back", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  const text = await linkPhone(page);

  expect(await text("12 lunch")).toBe(
    'Logged $12.00 for "lunch" today, in Dining. Text UNDO to remove it.',
  );

  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $488.00 today.");
  // The row says where it came from, in words.
  await expect(dayPanel(page).getByText("Dining, texted in")).toBeVisible();
  await expect(
    dayPanel(page).getByText("lunch", { exact: true }),
  ).toBeVisible();

  // Typos and a missing piece are asked about, and nothing is saved.
  expect(await text("spnt 5 on cofee")).toContain('Logged $5.00 for "cofee"');
  expect(await text("twelve bucks lunch")).toContain("in digits");
  expect(await text("12")).toContain("What was it for?");

  expect(await text("undo")).toBe('Removed $5.00 for "cofee".');
  expect(await text("UNDO")).toBe('Removed $12.00 for "lunch".');
  expect(await text("undo")).toContain("nothing to undo");

  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $500.00 today.");
  await expect(dayPanel(page).getByText("texted in")).toHaveCount(0);
});

test("with two accounts the agent asks which, and the next text can answer", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  await addAccount(page, {
    type: "Credit card",
    nickname: "Quicksilver",
    balance: "30",
  });
  const text = await linkPhone(page);

  expect(await text("40 gas")).toBe(
    'Which account for $40.00 "gas"? Reply with its number or name: 1 Everyday, 2 Quicksilver. Nothing is logged yet.',
  );
  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $500.00 today.");

  // The answer is the next text: a number, a name or the kind of account.
  expect(await text("2")).toContain(
    'Logged $40.00 for "gas" today on Quicksilver',
  );
  expect(await text("12 lunch")).toContain('Which account for $12.00 "lunch"?');
  expect(await text("it was from my checking account")).toContain(
    'Logged $12.00 for "lunch" today on Everyday',
  );
  // Naming the account in the first text needs no question.
  expect(await text("3 gum on card")).toContain(
    'Logged $3.00 for "gum" today on Quicksilver',
  );
  expect(await text("undo")).toBe('Removed $3.00 for "gum".');

  // The card purchase shows as spending without moving the balance; the
  // checking one moves it.
  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $488.00 today.");
  await expect(dayPanel(page).getByText(/on card · Quicksilver/)).toBeVisible();
});

test("statements, money coming in and photos are answered, never logged (HO-115)", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  const text = await linkPhone(page);

  // Help and small talk are answered by code.
  expect(await text("help")).toContain("Here's what you can text me");
  expect(await text("thanks")).toContain("Anytime");
  expect(await text("tell me a joke")).toContain(
    "I can only help with your money",
  );

  // None of these is spending: nothing is saved.
  expect(await text("I have 500")).not.toMatch(/Logged/);
  expect(await text("got 100 from mom")).toContain("money coming in");
  expect(await text("paid off my card 300")).toContain("aren't spending");
  expect(await text("food budget 300")).toContain("can't change budgets");
  expect(await text("spent 20 on lunch the day before yesterday")).toContain(
    "today or yesterday",
  );

  // A photo gets an answer instead of silence.
  expect(await text("", "attachment")).toContain("I can only read text");

  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $500.00 today.");
  await expect(dayPanel(page).getByText("texted in")).toHaveCount(0);
});
