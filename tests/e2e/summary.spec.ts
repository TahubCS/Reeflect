import { type Browser, type Page, expect, test } from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// F-15 (TEST-07): the summary panel on the dashboard. Each test signs up its
// own user, so its Personal workspace starts empty. The server under test
// has no Gemini key, so asking for a written summary takes the path where no
// model answers: the code-built summary stays, and the panel says so. A
// model's draft is covered in Vitest with a fake model.

async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Summary Tester",
    email: `e2e-summary-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

async function addChecking(page: Page, balance: string) {
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Add an account" }).click();
  await hydrated(page, "form select");
  await page
    .getByRole("textbox", { name: "Bank or card issuer", exact: true })
    .fill("Capital One");
  await page
    .getByRole("textbox", { name: "Nickname", exact: true })
    .fill("Everyday");
  await page.getByRole("textbox", { name: /Current balance/ }).fill(balance);
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/accounts$/);
}

const panel = (page: Page) =>
  page.getByRole("region", { name: "Where you stand" });

test("shows no summary panel before there is an account", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);

  await page.goto("/dashboard");

  await expect(
    page.getByRole("heading", { name: "Add an account to see your month." }),
  ).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test("summarises the same figures as the headline, and says who wrote it", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addChecking(page, "1,204.99");

  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "$1,204.99",
  );
  await expect(panel(page)).toContainText(
    "You have $1,204.99 in checking and savings.",
  );
  await expect(panel(page)).toContainText(
    "Confirm your payday on the Recurring payments page to see what you can spend each day.",
  );
  await expect(panel(page)).toContainText(/Built by .+ from your accounts\./);
  // Every label was filled in.
  await expect(panel(page)).not.toContainText(/[{}]/);
});

test("keeps the code-built summary, and says so, when Gemini does not answer", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addChecking(page, "1,204.99");
  await page.goto("/dashboard");
  const write = panel(page).getByRole("button", {
    name: "Write it with Gemini",
  });
  await hydrated(page, "section[aria-labelledby='summary-heading'] button");

  await write.click();

  await expect(panel(page).getByRole("status")).toContainText(
    "Gemini didn't answer just now",
  );
  await expect(panel(page)).toContainText(
    "You have $1,204.99 in checking and savings.",
  );
  await expect(panel(page)).toContainText(/Built by .+ from your accounts\./);
  // The button is ready to be tried again.
  await expect(write).toBeEnabled();
});
