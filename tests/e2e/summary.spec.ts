import { type Browser, type Page, expect, test } from "@playwright/test";
import { Pool } from "pg";
import { hydrated, signUpVerified } from "./support";

// F-15 (TEST-07): the summary panel on the dashboard. Each test signs up its
// own user, so its Personal workspace starts empty. The server under test
// has no Gemini key, so asking for a written summary takes the path where no
// model answers: the code-built summary stays, and the panel says so. A
// model's draft is covered in Vitest with a fake model; here a stored draft
// is put in the database the way a written one would be (ADR-068).

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

/** Rows as `writeSummary` keeps them, for the page's workspace and user. */
async function storeWrites(page: Page, drafts: (object | null)[]) {
  const workspaceId = /\/w\/([^/]+)\//.exec(page.url())![1];
  // Its own pool per call: one shared across tests breaks under
  // fullyParallel (see calendar.spec.ts).
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgres://test:test@localhost:5433/app_test",
    max: 1,
  });
  try {
    for (const draft of drafts) {
      await pool.query(
        `INSERT INTO summary_write (id, workspace_id, user_id, written_on, draft)
         SELECT $1, $2, user_id, $3, $4::jsonb FROM member WHERE organization_id = $2`,
        [
          crypto.randomUUID(),
          workspaceId,
          today,
          draft === null ? null : JSON.stringify(draft),
        ],
      );
    }
  } finally {
    await pool.end();
  }
}

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
  await expect(panel(page)).toContainText(
    "5 of 5 Gemini summaries left today.",
  );
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
  // The try was counted, and the button is ready to be tried again.
  await expect(panel(page)).toContainText(
    "4 of 5 Gemini summaries left today.",
  );
  await expect(write).toBeEnabled();

  await page.reload();

  await expect(panel(page)).toContainText(
    "4 of 5 Gemini summaries left today.",
  );
});

test("a summary Gemini wrote stays after a refresh, with the figures as they are now", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addChecking(page, "1,204.99");
  await page.goto("/dashboard");
  await expect(panel(page)).toContainText(/Built by .+ from your accounts\./);

  await storeWrites(page, [
    {
      summary: "Right now {cash_total} is in your accounts.",
      suggestions: ["Add a payday on the Recurring payments page."],
    },
  ]);
  await page.reload();

  await expect(panel(page)).toContainText(
    "Right now $1,204.99 is in your accounts.",
  );
  await expect(panel(page)).toContainText(
    "Add a payday on the Recurring payments page.",
  );
  await expect(panel(page)).toContainText(
    /Written by Gemini at \d{1,2}:\d{2}\s[AP]M, around figures .+ worked out\./,
  );
  await expect(panel(page)).toContainText(
    "4 of 5 Gemini summaries left today.",
  );
  await expect(
    panel(page).getByRole("button", { name: "Write it again" }),
  ).toBeEnabled();
});

test("says when today's summaries are used up, and offers no more", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addChecking(page, "1,204.99");
  await page.goto("/dashboard");
  await expect(panel(page)).toContainText(/Built by .+ from your accounts\./);

  await storeWrites(page, [null, null, null, null, null]);
  await page.reload();

  await expect(panel(page)).toContainText(
    "You've used today's 5 Gemini summaries. You can ask again tomorrow.",
  );
  await expect(
    panel(page).getByRole("button", { name: "Write it with Gemini" }),
  ).toBeDisabled();
  // The summary itself is still there.
  await expect(panel(page)).toContainText(
    "You have $1,204.99 in checking and savings.",
  );
});
