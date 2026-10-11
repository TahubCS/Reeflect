import {
  type APIRequestContext,
  type Browser,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { Pool } from "pg";
import { hydrated, signUpVerified } from "./support";

// F-22 and F-26 (ADR-038, ADR-105): Reeflect texts first about a new
// subscription and a bill due this week, with no amounts; DETAILS and KEEP
// are answered by code. The job tick is called as the worker would call it,
// texts the app sends land in the stand-in worker
// (tests/support/stand-in-worker.ts), and the phone's replies are posted to
// /api/agent/turn.

const SERVICE_TOKEN = "e2e-only-agent-service-token-0123456789";
const WORKER_URL = `http://localhost:${process.env.STAND_IN_WORKER_PORT ?? "8799"}`;
const MONEY = /[$¢€£]|\d+\.\d{2}\b/;

let pool: Pool;
test.beforeAll(() => {
  pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgres://test:test@localhost:5433/app_test",
    max: 2,
  });
});
const users: string[] = [];

const localToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const [year, month] = localToday.split("-").map(Number);
const firstOfMonth = (offset: number) =>
  new Date(Date.UTC(year!, month! - 1 + offset, 1)).toISOString().slice(0, 10);
const inDays = (days: number) =>
  new Date(Date.parse(`${localToday}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
/** An hour from now on New York's clock, as "HH:00". */
const hourFromNow = (hours: number) => {
  const now = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return `${String((now + hours) % 24).padStart(2, "0")}:00`;
};

test.afterAll(async () => {
  if (users.length > 0) {
    await pool.query(
      `DELETE FROM organization WHERE id IN (SELECT organization_id FROM member WHERE user_id = ANY($1::text[]))`,
      [users],
    );
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [users]);
  }
  await pool.end();
  users.length = 0;
});

async function textsSentTo(
  request: APIRequestContext,
  handle: string,
): Promise<string[]> {
  const response = await request.get(`${WORKER_URL}/sent`, {
    headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
    params: { spaceId: `any;-;${handle}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as string[];
}

async function openSettings(page: Page) {
  await page.goto("/settings");
  await hydrated(page, "main form button");
}

const notifications = (page: Page) =>
  page.getByRole("region", { name: "Notifications" });

async function newUserPage(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Alert Tester",
    email: `e2e-alerts-${crypto.randomUUID()}@example.test`,
  });
  const session = await context.request.get("/api/auth/get-session");
  users.push(((await session.json()) as { user: { id: string } }).user.id);
  return context.newPage();
}

test("the alert switches are saved", async ({ browser, baseURL }) => {
  const page = await newUserPage(browser, baseURL);
  await openSettings(page);
  const subscriptions = notifications(page).getByLabel(
    "New subscriptions it finds",
  );
  const bills = notifications(page).getByLabel("Bills due within a week");
  await expect(subscriptions).toBeChecked();
  await expect(bills).toBeChecked();

  await subscriptions.uncheck();
  await expect(subscriptions).not.toBeChecked();
  await expect(subscriptions).toBeEnabled();

  await openSettings(page);
  await expect(
    notifications(page).getByLabel("New subscriptions it finds"),
  ).not.toBeChecked();
  await expect(
    notifications(page).getByLabel("Bills due within a week"),
  ).toBeChecked();
});

test("a new subscription and a bill are texted without amounts; DETAILS and KEEP answer", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
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
  const tick = async () => {
    const response = await page.request.post("/api/jobs/tick", {
      headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
    });
    expect(response.status()).toBe(200);
  };

  // Link the phone and opt in, as a user would.
  await openSettings(page);
  await page.getByRole("button", { name: "Connect iMessage" }).click();
  const instruction = page.getByText(/^LINK \d{3} \d{3}$/);
  await expect(instruction).toBeVisible();
  await text((await instruction.textContent())!);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/^Connected: phone ending/)).toBeVisible();
  const optIn = page.getByLabel("Text me about new subscriptions and bills");
  await optIn.check();
  await expect(optIn).toBeChecked();
  // Quiet hours that do not cover now, whenever the test runs.
  const card = notifications(page);
  await card.getByLabel("Start").fill(hourFromNow(2));
  await card.getByLabel("End").fill(hourFromNow(3));
  await card.getByRole("button", { name: "Save quiet hours" }).click();
  await expect(card.getByRole("status")).toHaveText("Quiet hours saved.");
  const sentBefore = (await textsSentTo(page.request, handle)).length;

  // Three monthly charges, and a bill due in three days.
  const workspaceId = (
    await pool.query<{ id: string }>(
      `SELECT organization_id AS id FROM member WHERE user_id = $1`,
      [users.at(-1)],
    )
  ).rows[0]!.id;
  const accountId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO financial_account (id, workspace_id, institution_name, type, nickname, source, current_balance_cents) VALUES ($1,$2,'Synthetic bank','checking','Everyday','synthetic',20000)`,
    [accountId, workspaceId],
  );
  for (const offset of [-3, -2, -1]) {
    await pool.query(
      `INSERT INTO "transaction" (id, workspace_id, financial_account_id, description_raw, posted_on, amount_cents, source, fingerprint) VALUES ($1,$2,$3,'Stream Service',$4,-1549,'csv',$5)`,
      [
        crypto.randomUUID(),
        workspaceId,
        accountId,
        firstOfMonth(offset),
        crypto.randomUUID(),
      ],
    );
  }
  await pool.query(
    `INSERT INTO recurring_series (id, workspace_id, financial_account_id, merchant_normalized, name, decision, kind, amount_mode, schedule_unit, schedule_every, amount_cents, baseline_amount_cents, next_on, manual) VALUES ($1,$2,$3,'car loan','Car loan','confirmed','bill','fixed','months',1,32000,32000,$4,true)`,
    [crypto.randomUUID(), workspaceId, accountId, inDays(3)],
  );

  await tick();
  await tick(); // a second run sends nothing new

  const texts = (await textsSentTo(page.request, handle)).slice(sentBefore);
  expect(texts).toHaveLength(2);
  for (const sent of texts) expect(sent).not.toMatch(MONEY);
  const bill = texts.find((sent) => sent.includes("Car loan"))!;
  expect(bill).toContain("Reply DETAILS to see the amount.");
  const subscription = texts.find((sent) => sent.includes("new subscription"))!;
  expect(subscription).toContain("Reply KEEP");

  // A reply answers the most recent alert.
  const latest = texts.at(-1)!;
  const details = await text("DETAILS");
  expect(details).toMatch(/\$\d/);
  if (latest === bill) {
    expect(details).toContain("Your balance is $200.00");
    expect(await text("KEEP")).toContain("nothing to keep or cancel");
  } else {
    expect(details).toContain("$15.49 a charge");
    expect(await text("KEEP")).toContain("marked Keep");
    const { rows } = await pool.query<{ user_intent: string }>(
      `SELECT user_intent FROM recurring_series WHERE workspace_id=$1 AND decision='confirmed' AND kind='subscription'`,
      [workspaceId],
    );
    expect(rows.map((row) => row.user_intent)).toEqual(["keep"]);
  }
});
