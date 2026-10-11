import {
  type Browser,
  type Locator,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { Pool } from "pg";
import { hydrated, signUpVerified } from "./support";

// F-12 and F-13 (TEST-07): the calendar home screen on the workspace's own
// accounts and transactions. Each test signs up its own user, so its Personal
// workspace starts empty. Today is today in the app's time zone
// (DEFAULT_TIME_ZONE), so no figure depends on the date.

const TIME_ZONE = "America/New_York";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const todayLong = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Calendar Tester",
    email: `e2e-calendar-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

// By role, so the hidden copy Next keeps of the previous page never matches.
const field = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true });

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
  await field(page, "Bank or card issuer").fill("Capital One");
  await field(page, "Nickname").fill(account.nickname);
  await page
    .getByRole("textbox", { name: /Current balance|Amount owed/ })
    .fill(account.balance);
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/accounts$/);
}

async function openDashboard(page: Page) {
  await page.goto("/dashboard");
  await hydrated(page, "button[data-date]");
}

const headline = (page: Page): Locator =>
  page.getByRole("heading", { level: 1 });
const dayPanel = (page: Page): Locator =>
  page.getByRole("complementary", { name: "Selected day" });
const cell = (page: Page, date: string): Locator =>
  page.locator(`button[data-date="${date}"]`);

async function spend(page: Page, amount: string, what: string) {
  const panel = dayPanel(page);
  await panel.getByLabel("How much?").fill(amount);
  await panel.getByLabel("What was it for?").fill(what);
  await panel.getByRole("button", { name: /^Add to / }).click();
  await expect(panel.getByText(what, { exact: true })).toBeVisible();
}

test("a new workspace is asked to add an account first", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await page.goto("/dashboard");

  await expect(headline(page)).toHaveText("Add an account to see your month.");
  await expect(
    page.getByRole("link", { name: "Add an account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Import a statement" }),
  ).toBeVisible();
  await expect(page.getByText("Sample data")).toHaveCount(0);
});

test("opens on today with the account's balance, and adding and removing spending moves it", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  await openDashboard(page);

  await expect(headline(page)).toHaveText("You have $500.00 today.");
  await expect(dayPanel(page).getByRole("heading", { level: 2 })).toHaveText(
    todayLong,
  );
  await expect(
    page
      .getByRole("region", { name: "Subscriptions" })
      .getByRole("link", { name: "Recurring payments" }),
  ).toBeVisible();

  await spend(page, "16", "Bus pass");

  await expect(headline(page)).toHaveText("You have $484.00 today.");
  await expect(dayPanel(page).getByText(/added by you/)).toBeVisible();
  await expect(cell(page, today)).toContainText("Bus pass");
  await expect(
    page.getByRole("region", { name: /What we noticed/ }),
  ).toContainText("isn’t in a category yet: $16.00 across 1 purchase");

  await dayPanel(page).getByRole("button", { name: "Remove Bus pass" }).click();

  await expect(headline(page)).toHaveText("You have $500.00 today.");
  await expect(dayPanel(page).getByText("Bus pass")).toHaveCount(0);
});

test("rejects an amount that is not a number", async ({ browser, baseURL }) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  await openDashboard(page);

  await dayPanel(page).getByLabel("How much?").fill("lots");
  await dayPanel(page)
    .getByRole("button", { name: /^Add to / })
    .click();

  await expect(dayPanel(page).getByRole("alert")).toHaveText(
    "Enter an amount like 12.50.",
  );
  await expect(headline(page)).toHaveText("You have $500.00 today.");
});

test("filters by kind, switches to the list and moves by arrow keys", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  await openDashboard(page);
  await spend(page, "9.50", "Coffee beans");

  const show = page.getByRole("group", { name: "Show" });
  await show.getByRole("button", { name: "Money in" }).click();
  await expect(show.getByRole("button", { name: "Money in" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(cell(page, today)).not.toContainText("Coffee beans");
  await show.getByRole("button", { name: "Everything" }).click();
  await expect(cell(page, today)).toContainText("Coffee beans");

  const layout = page.getByRole("group", { name: "Layout" });
  await layout.getByRole("button", { name: "List" }).click();
  await expect(page.locator("ol.agenda")).toContainText("Coffee beans");
  await layout.getByRole("button", { name: "Calendar" }).click();

  await cell(page, today).focus();
  // On the 1st there is no day to the left in this month's grid.
  await page.keyboard.press(today.endsWith("-01") ? "ArrowRight" : "ArrowLeft");
  await expect(
    dayPanel(page).getByRole("heading", { level: 2 }),
  ).not.toHaveText(todayLong);
});

test("a card purchase shows as spending on card without moving the balance", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  await addAccount(page, {
    type: "Credit card",
    nickname: "Quicksilver",
    balance: "120",
  });
  await openDashboard(page);

  await dayPanel(page).getByLabel("Account", { exact: true }).selectOption({
    label: "Quicksilver",
  });
  await spend(page, "30", "Shoes");

  await expect(dayPanel(page).getByText(/on card · Quicksilver/)).toBeVisible();
  await expect(headline(page)).toHaveText("You have $500.00 today.");
  await expect(
    page.getByRole("region", { name: /What we noticed/ }),
  ).toContainText("$30.00");
});

// F-10 with ADR-061: paydays and subscriptions confirmed on Recurring payments
// show on the calendar. History goes straight into the test database, as in
// recurring.spec.ts, so the patterns are there without typing every row.

const shiftDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
const monthStart = (offset: number) => {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10);
};

async function seedHistory(workspaceId: string) {
  // Its own pool, closed when the rows are in. A pool shared by the file and
  // closed in afterAll breaks under fullyParallel: a worker that has run
  // some of this file's tests and closed it can be handed this one later.
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgres://test:test@localhost:5433/app_test",
    max: 2,
  });
  try {
    await seedRows(pool, workspaceId);
  } finally {
    await pool.end();
  }
}

async function seedRows(pool: Pool, workspaceId: string) {
  const accountId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO financial_account (id, workspace_id, institution_name, type, nickname, source, current_balance_cents) VALUES ($1,$2,'Synthetic bank','checking','Everyday','synthetic',200000)`,
    [accountId, workspaceId],
  );
  const add = (description: string, postedOn: string, amountCents: number) =>
    pool.query(
      `INSERT INTO "transaction" (id, workspace_id, financial_account_id, description_raw, posted_on, amount_cents, source, fingerprint) VALUES ($1,$2,$3,$4,$5,$6,'csv',$1)`,
      [
        crypto.randomUUID(),
        workspaceId,
        accountId,
        description,
        postedOn,
        amountCents,
      ],
    );
  for (const daysAgo of [42, 28, 14, 0])
    await add("ACME PAYROLL", shiftDays(today, -daysAgo), 145000);
  for (const offset of [-2, -1, 0])
    await add("Stream Service", monthStart(offset), -1599);
}

test("confirmed paydays and subscriptions fill the headline and the subscriptions list", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/w\/[^/]+\/dashboard$/);
  const workspaceId = new URL(page.url()).pathname.split("/")[2]!;
  await seedHistory(workspaceId);
  await openDashboard(page);

  // Suggestions wait for the person (ADR-058).
  await expect(headline(page)).toHaveText("You have $2,000.00 today.");
  await expect(
    page.getByRole("link", { name: "2 recurring payments to review" }),
  ).toBeVisible();

  await page.goto("/subscriptions");
  for (const name of ["acme payroll", "stream service"]) {
    const card = page.getByRole("article", { name, exact: true });
    await card
      .getByRole("button", { name: "Confirm recurring payment" })
      .click();
    await expect(card).toContainText("Tracking");
  }
  await expect(
    page.getByRole("article", { name: "acme payroll", exact: true }),
  ).toContainText("Payday · Every two weeks");

  await openDashboard(page);
  await expect(headline(page)).toContainText("a day until payday.");
  await expect(page.locator(".hero-why")).toContainText("14 days away");

  const subscriptions = page.getByRole("region", { name: "Subscriptions" });
  await expect(subscriptions).toContainText("stream service");
  await expect(subscriptions).toContainText("$191.88 a year");
  await subscriptions.getByRole("button", { name: "Keeping" }).click();
  await expect(
    subscriptions.getByRole("button", { name: "Planning to cancel" }),
  ).toBeVisible();
  await expect(subscriptions.locator(".saving")).toContainText("$191.88");

  // The choice is saved where Recurring payments reads it.
  await page.goto("/subscriptions");
  await expect(
    page.getByRole("article", { name: "stream service", exact: true }),
  ).toContainText("Choice: Planning to cancel");
});
