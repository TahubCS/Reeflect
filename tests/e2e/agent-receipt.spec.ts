import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import {
  addAccount,
  dayPanel,
  headline,
  linkPhone,
  newUserPage,
  openDashboard,
} from "./agent-support";

// F-29 (ADR-067): a receipt photo becomes a question, and only "yes" puts
// it on the calendar. The photo is a generated fixture (TEST-08), posted to
// /api/agent/turn as the worker would forward it. No model is called under
// test (ADR-059), so the reading itself is covered by the unit tests; here
// a receipt that has been read is put in place the way the app stores it,
// and the person's answer goes through the real endpoint.

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://test:test@localhost:5433/app_test",
});

test.afterAll(async () => {
  await pool.end();
});

const RECEIPT = {
  status: "attached",
  mimeType: "image/png",
  data: readFileSync("tests/fixtures/receipts/normal.png", "base64"),
} as const;

/** What reading `normal.png` leaves waiting for this phone's answer. */
async function receiptWaiting(handle: string) {
  const identity = await pool.query(
    `SELECT id, workspace_id FROM messaging_identity WHERE handle=$1`,
    [handle],
  );
  const { id, workspace_id: workspaceId } = identity.rows[0];
  const accounts = await pool.query(
    `SELECT id FROM financial_account WHERE workspace_id=$1 ORDER BY created_at, id`,
    [workspaceId],
  );
  await pool.query(
    `INSERT INTO agent_pending_log (identity_id, workspace_id, amount_cents, description, day, account_ids, asked_at, kind, message_id)
     VALUES ($1, $2, 2340, 'Corner Market', 'today', $3, now(), 'receipt', $4)`,
    [id, workspaceId, accounts.rows.map((row) => row.id), crypto.randomUUID()],
  );
}

test("a receipt that was read is logged on yes, and UNDO takes it back", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  const text = await linkPhone(page);

  await receiptWaiting(text.handle);
  // Nothing is on the calendar while the question is open.
  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $500.00 today.");
  // A question in between is answered and leaves the receipt waiting.
  expect(await text("how am I doing?")).toContain("$500.00");

  expect(await text("yes")).toBe(
    'Logged $23.40 for "Corner Market" today. Text UNDO to remove it.',
  );

  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $476.60 today.");
  await expect(dayPanel(page).getByText("texted in")).toBeVisible();
  await expect(
    dayPanel(page).getByText("Corner Market", { exact: true }),
  ).toBeVisible();

  // Said once: a second yes has nothing to confirm.
  expect(await text("yes")).toBe(
    'There\'s nothing waiting for an answer. To log spending, text it like "12 lunch".',
  );
  expect(await text("undo")).toBe('Removed $23.40 for "Corner Market".');
  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $500.00 today.");
  await expect(dayPanel(page).getByText("texted in")).toHaveCount(0);
});

test("no drops a receipt, and with two accounts the account is the yes", async ({
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

  await receiptWaiting(text.handle);
  expect(await text("no")).toBe(
    'Okay, I dropped it. Nothing was logged. You can text it instead, like "12 lunch".',
  );
  expect(await text("yes")).toContain("nothing waiting");

  await receiptWaiting(text.handle);
  // "yes" does not say which account, so nothing is saved yet.
  expect(await text("yes")).toBe(
    "Which account? Reply with its number or name: 1 Everyday, 2 Quicksilver. Or reply no to drop it. Nothing is logged yet.",
  );
  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $500.00 today.");
  await expect(dayPanel(page).getByText("texted in")).toHaveCount(0);

  expect(await text("1")).toBe(
    'Logged $23.40 for "Corner Market" today on Everyday. Text UNDO to remove it.',
  );
  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $476.60 today.");
});

test("a photo saves nothing by itself, whatever comes with it", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  const text = await linkPhone(page);

  // The switch is on for this server and there is no model key, so the
  // photo travels the whole way and the reading is what is unavailable.
  const NOT_NOW =
    'I can\'t read photos right now. Text it like "12 lunch". Nothing was logged.';
  expect(await text.photo(RECEIPT)).toBe(NOT_NOW);
  // A caption is not read as spending.
  expect(await text.photo(RECEIPT, "12 lunch")).toBe(NOT_NOW);
  // A picture as large as the worker may forward still reaches the app.
  const largest = Buffer.alloc(3_000_000);
  Buffer.from(RECEIPT.data, "base64").copy(largest);
  expect(
    await text.photo({ ...RECEIPT, data: largest.toString("base64") }),
  ).toBe(NOT_NOW);

  expect(await text.photo({ status: "too_large" })).toContain("too big");
  expect(await text.photo({ status: "several" })).toBe(
    "Send one receipt photo at a time. Nothing was logged.",
  );
  expect(await text.photo({ status: "unsupported" })).toContain(
    "can't read that kind of file",
  );
  // Bytes that are not the picture they claim to be.
  expect(
    await text.photo({
      status: "attached",
      mimeType: "image/jpeg",
      data: RECEIPT.data,
    }),
  ).toContain("can't read that kind of file");
  expect(await text("yes")).toContain("nothing waiting");

  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $500.00 today.");
  await expect(dayPanel(page).getByText("texted in")).toHaveCount(0);

  // The endpoint refuses a photo that is not in the protocol's shape.
  for (const photo of [
    { status: "attached", mimeType: "image/gif", data: RECEIPT.data },
    { status: "attached", mimeType: "image/png", data: "not base64!" },
    { status: "lost" },
  ]) {
    const response = await page.request.post("/api/agent/turn", {
      headers: {
        authorization: "Bearer e2e-only-agent-service-token-0123456789",
      },
      data: {
        platform: "imessage",
        handle: text.handle,
        spaceId: `any;-;${text.handle}`,
        messageId: crypto.randomUUID(),
        text: "",
        photo,
      },
    });
    expect(response.status()).toBe(400);
  }
});
