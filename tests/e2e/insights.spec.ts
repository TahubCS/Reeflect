import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { Pool } from "pg";
import { ownClientAddress, signUpVerified } from "./support";

// Insights (F-35, ADR-055) in a real browser against the local PostgreSQL.
// A small sample batch's stored figures are written directly, as
// `pnpm batch load` would leave them; your rows are entered as an importer
// would. The page compares the two.
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5433/app_test",
  max: 2,
});

// The page uses the newest batch in the database, so these tests share one.
test.describe.configure({ mode: "serial" });

const batchId = crypto.randomUUID();
const PEOPLE = 25;
let context: BrowserContext;
let page: Page;
let workspaceId: string;
let userId: string;

/** `days` before yesterday (UTC), where your period ends. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1 - days);
  return date.toISOString().slice(0, 10);
}

async function loadSampleBatch() {
  await pool.query(
    `INSERT INTO synthetic_batch (id, label, generator_version, seed, start_month, months, as_of, spec)
    VALUES ($1, 'e2e insights sample', 2, 'e2e', '2025-10', 12, $2, '{}')`,
    [batchId, daysAgo(0)],
  );
  for (let i = 0; i < PEOPLE; i++) {
    const id = crypto.randomUUID();
    const takeHome = (i + 1) * 100_000; // $1,000 … $25,000 a month.
    await pool.query(
      `INSERT INTO organization (id, name, slug, created_at, metadata)
      VALUES ($1, $2, $3, now(), '{"synthetic":true}')`,
      [id, `Sample · Person ${i}`, `synthetic-e2e-${id}`],
    );
    await pool.query(
      `INSERT INTO synthetic_workspace (workspace_id, batch_id, person_key, persona, summary)
      VALUES ($1, $2, $3, $4, 'e2e')`,
      [id, batchId, `p${i}`, i % 5 === 0 ? "student" : "salaried_middle"],
    );
    const figures: [string, number][] = [
      ["covered_days", 30],
      ["take_home", takeHome],
      ["spending", takeHome * 0.8],
      ["kept", takeHome * 0.2],
      ["saved", 10_000],
      ["bills", takeHome * 0.4],
      ["subscription_cost", 3_000],
      ["subscription_count", 2],
      ["no_spend_days", 10],
      ["lowest_balance", 50_000],
      ["category:groceries", 30_000 + i * 1_000],
      ["category:housing", takeHome * 0.4],
    ];
    for (const days of [30, 90, 365]) {
      await pool.query(
        `INSERT INTO insight_sample (batch_id, workspace_id, period_days, measure, value)
        SELECT $1, $2, $3, m, v FROM unnest($4::text[], $5::bigint[]) AS f(m, v)`,
        [
          batchId,
          id,
          days,
          figures.map(([m]) => m),
          figures.map(([, v]) => Math.round(v)),
        ],
      );
    }
  }
}

test.beforeAll(async ({ browser, baseURL }) => {
  await loadSampleBatch();
  context = await browser.newContext({ extraHTTPHeaders: ownClientAddress() });
  await signUpVerified(context.request, baseURL, {
    name: "Insights Tester",
    email: `e2e-insights-${crypto.randomUUID()}@example.test`,
  });
  const session = await (
    await context.request.get("/api/auth/get-session")
  ).json();
  userId = session.user.id;
  page = await context.newPage();
  // An editor's first Transactions visit seeds the preset categories.
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/w\/[^/]+\/transactions$/);
  workspaceId = new URL(page.url()).pathname.split("/")[2]!;

  const accountId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO financial_account (id, workspace_id, institution_name, type, nickname, source, current_balance_cents, balance_as_of)
    VALUES ($1, $2, 'Synthetic bank', 'checking', 'Everyday', 'synthetic', 200000, $3)`,
    [accountId, workspaceId, daysAgo(0)],
  );
  const {
    rows: [groceries],
  } = await pool.query(
    `UPDATE category SET name = 'Food' WHERE workspace_id = $1 AND preset_key = 'groceries' RETURNING id`,
    [workspaceId],
  );
  const rows: [string, number, string, string | null][] = [
    // Before the 30 days, so they are fully covered.
    [daysAgo(40), -500, "Corner coffee", null],
    [daysAgo(5), 300_000, "Payroll deposit", null],
    [daysAgo(3), -45_000, "Corner market", groceries.id],
    [daysAgo(2), -10_000, "Mystery shop", null],
  ];
  for (const [postedOn, amount, description, categoryId] of rows) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "transaction" (id, workspace_id, financial_account_id, posted_on, amount_cents, description_raw, source, fingerprint, category_id, category_is_manual)
      VALUES ($1, $2, $3, $4, $5, $6, 'synthetic', $1, $7, $8)`,
      [
        id,
        workspaceId,
        accountId,
        postedOn,
        amount,
        description,
        categoryId,
        categoryId !== null,
      ],
    );
  }
});

test.afterAll(async () => {
  await context?.close();
  if (userId) {
    await pool.query(
      `DELETE FROM organization WHERE id IN (SELECT organization_id FROM member WHERE user_id = $1)`,
      [userId],
    );
    await pool.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
  }
  await pool.query(
    `DELETE FROM organization WHERE id IN (SELECT workspace_id FROM synthetic_workspace WHERE batch_id = $1)`,
    [batchId],
  );
  await pool.query(`DELETE FROM synthetic_batch WHERE id = $1`, [batchId]);
  await pool.end();
});

const context_ = () =>
  page.getByRole("region", { name: "Who you are compared with" });

test("shows your take-home next to the group's, labelled Sample", async () => {
  await page.goto(`/w/${workspaceId}/insights?period=30`);
  await expect(
    page.getByRole("heading", { name: "Insights", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Sample", { exact: true })).toBeVisible();
  // $3,000 over 30 days is $3,044 in an average month of 30.4375 days.
  await expect(context_()).toContainText("Your take-home$3,044 a month");
  await expect(context_()).toContainText("Compared with 20 sample people");
  await expect(context_()).toContainText("$1,000 to $20,000 a month");
  await expect(context_()).toContainText("Salaried");
  await expect(context_()).toContainText("Student");
});

test("compares spending by category under your own category names", async () => {
  const categories = page.getByRole("region", { name: "Spending by category" });
  const food = categories.getByRole("listitem").filter({ hasText: "Food" });
  // Typical: the median of $300 … $490 across the 20 people.
  await expect(food).toContainText("You $457 · Typical $395");
  await expect(food).toContainText("more than typical");
  await expect(categories).toContainText(
    "$101 a month of your spending (18.2% of it) is Uncategorized",
  );
  await expect(
    categories.getByRole("link", { name: "Add rules on Transactions" }),
  ).toHaveAttribute("href", `/w/${workspaceId}/transactions`);

  await categories.getByRole("link", { name: "Share of take-home" }).click();
  await expect(page).toHaveURL(/show=share/);
  await expect(
    page
      .getByRole("region", { name: "Spending by category" })
      .getByRole("listitem")
      .filter({ hasText: "Food" }),
  ).toContainText("You 15%");
});

test("says where you stand in words, not only position", async () => {
  const standing = page.getByRole("region", { name: "Where you stand" });
  const spent = standing.getByRole("listitem").filter({ hasText: "Spent" });
  await expect(spent).toContainText("$558 a month");
  await expect(spent).toContainText("Lower than most of this group");
  await expect(spent.getByRole("img")).toHaveAttribute(
    "aria-label",
    "Spent: you $558. Typical $8,400. Middle half $4,600 to $12,200.",
  );
});

test("switches to everyone and to a longer period", async () => {
  await page.getByRole("link", { name: "Everyone" }).click();
  await expect(page).toHaveURL(/compare=everyone/);
  await expect(context_()).toContainText("Compared with 25 sample people");
  await expect(context_()).toContainText("$1,000 to $25,000 a month");

  await page.getByRole("link", { name: "Last year" }).click();
  await expect(page).toHaveURL(/period=365/);
  await expect(context_()).toContainText("figures cover the last 41 days");
});
