import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { normalizeMerchant } from "@/features/categorization/client";
import { previewImportAction, commitImportAction } from "@/features/imports";
import { db } from "@/lib/db/client";
import { financialAccount, importBatch, transaction } from "@/lib/db/schema";
import { fixtures, isRedirect } from "../../../../tests/support/db-fixtures";
import {
  confirmPattern,
  listRecurringPayments,
  refreshRecurringSeries,
  setPaymentIntent,
} from "./repository";

// Real public PDF/CSV actions, parsers, reconciliation and PostgreSQL commit.
// Only session and external object transport are faked. This verifies the
// recurring/import boundary independently of Neon's storage credentials.
const mocked = vi.hoisted(() => ({
  getSession: vi.fn(),
  objects: new Map<string, string>(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocked.getSession }));
vi.mock("@/lib/storage", async (original) => ({
  ...(await original<typeof import("@/lib/storage")>()),
  statementStore: () => ({
    put: async (key: string, body: string) => {
      mocked.objects.set(key, body);
    },
    get: async (key: string) => mocked.objects.get(key) ?? null,
    delete: async (key: string) => {
      mocked.objects.delete(key);
    },
    listKeys: async (prefix: string) =>
      [...mocked.objects.keys()].filter((key) => key.startsWith(prefix)),
    deletePrefix: async (prefix: string) => {
      for (const key of mocked.objects.keys())
        if (key.startsWith(prefix)) mocked.objects.delete(key);
    },
  }),
}));
const f = fixtures();
let workspaceId: string;
let accountId: string;
const now = new Date("2026-09-30T15:00:00Z");
beforeAll(async () => {
  const userId = await f.newUser();
  workspaceId = await f.newWorkspace({ [userId]: "owner" });
  mocked.getSession.mockResolvedValue({ user: { id: userId } });
  accountId = (
    await db
      .insert(financialAccount)
      .values({
        workspaceId,
        institutionName: "Capital One",
        nickname: "Statements",
        maskLast4: "1234",
        type: "checking",
        source: "manual",
        currentBalanceCents: 10000,
      })
      .returning()
  )[0]!.id;
});

it("derives a recurring rent pattern after the real CSV commit without changing imported balances or rows", async () => {
  const csvAccountId = (
    await db
      .insert(financialAccount)
      .values({
        workspaceId,
        institutionName: "Capital One",
        nickname: "CSV statements",
        maskLast4: "1234",
        type: "checking",
        source: "manual",
        currentBalanceCents: 100000,
      })
      .returning()
  )[0]!.id;
  await db.insert(transaction).values(
    ["2026-07-12", "2026-08-12"].map((postedOn) => ({
      workspaceId,
      financialAccountId: csvAccountId,
      postedOn,
      amountCents: -120000,
      descriptionRaw: "RENT PAYMENT",
      source: "csv" as const,
      fingerprint: crypto.randomUUID(),
    })),
  );
  const upload = new FormData();
  upload.set("accountId", csvAccountId);
  upload.set(
    "statement",
    new File(
      [
        readFileSync(
          new URL(
            "../../../../tests/fixtures/csv/capital-one-360-normal.csv",
            import.meta.url,
          ),
        ),
      ],
      "synthetic.csv",
      { type: "text/csv" },
    ),
  );
  expect(
    isRedirect(await thrown(previewImportAction(workspaceId, {}, upload))),
  ).toBe(true);
  const batch = (
    await db
      .select()
      .from(importBatch)
      .where(eq(importBatch.financialAccountId, csvAccountId))
  )[0]!;
  const confirmation = new FormData();
  confirmation.set("confirmIdentity", "yes");
  expect(
    isRedirect(
      await thrown(commitImportAction(workspaceId, batch.id, {}, confirmation)),
    ),
  ).toBe(true);
  const merchant = normalizeMerchant("RENT PAYMENT");
  const payments = (await listRecurringPayments(workspaceId, now)).payments;
  expect(
    payments.find(
      (payment) =>
        payment.accountId === csvAccountId && payment.merchant === merchant,
    ),
  ).toMatchObject({
    decision: "candidate",
    amount: 120000,
    amountMode: "fixed",
    charges: expect.arrayContaining([
      expect.objectContaining({ source: "csv", postedOn: "2026-09-12" }),
    ]),
  });
  const facts = async () => ({
    account: await db
      .select()
      .from(financialAccount)
      .where(eq(financialAccount.id, csvAccountId)),
    transactions: await db
      .select()
      .from(transaction)
      .where(eq(transaction.financialAccountId, csvAccountId))
      .orderBy(transaction.id),
    imports: await db
      .select()
      .from(importBatch)
      .where(eq(importBatch.financialAccountId, csvAccountId)),
  });
  const before = await facts();
  expect(before.account[0]!.currentBalanceCents).toBe(173410);
  expect(before.imports[0]).toMatchObject({
    kind: "csv",
    status: "committed",
    rowsImported: 5,
  });
  expect(await confirmPattern(workspaceId, csvAccountId, merchant, now)).toBe(
    "ok",
  );
  await refreshRecurringSeries(workspaceId, [csvAccountId], now);
  expect(
    (await listRecurringPayments(workspaceId, now)).payments.find(
      (payment) =>
        payment.accountId === csvAccountId && payment.merchant === merchant,
    ),
  ).toMatchObject({ decision: "confirmed", amount: 120000, actual: 120000 });
  expect(await facts()).toEqual(before);
});
afterAll(async () => {
  mocked.objects.clear();
  await f.cleanUp();
});

async function thrown(action: Promise<unknown>) {
  try {
    return await action;
  } catch (error) {
    return error;
  }
}
it("derives patterns after the real PDF commit, preserves choices on refresh and changes no import facts", async () => {
  await db.insert(transaction).values(
    ["2026-07-09", "2026-08-09"].map((postedOn) => ({
      workspaceId,
      financialAccountId: accountId,
      postedOn,
      amountCents: -1549,
      descriptionRaw: "Debit Card Purchase STREAMING SVC",
      source: "csv" as const,
      fingerprint: crypto.randomUUID(),
    })),
  );
  expect(
    (await listRecurringPayments(workspaceId, now)).payments.filter(
      (payment) => payment.accountId === accountId,
    ),
  ).toEqual([]);
  const upload = new FormData();
  upload.set("accountId", accountId);
  upload.set(
    "statement",
    new File(
      [
        readFileSync(
          new URL(
            "../../../../tests/fixtures/pdf/capital-one-normal.pdf",
            import.meta.url,
          ),
        ),
      ],
      "synthetic.pdf",
      { type: "application/pdf" },
    ),
  );
  expect(
    isRedirect(await thrown(previewImportAction(workspaceId, {}, upload))),
  ).toBe(true);
  const batch = (
    await db
      .select()
      .from(importBatch)
      .where(eq(importBatch.financialAccountId, accountId))
  )[0]!;
  const confirmation = new FormData();
  confirmation.set("confirmIdentity", "yes");
  expect(
    isRedirect(
      await thrown(commitImportAction(workspaceId, batch.id, {}, confirmation)),
    ),
  ).toBe(true);
  const merchant = normalizeMerchant("Debit Card Purchase STREAMING SVC");
  const view = await listRecurringPayments(workspaceId, now);
  expect(
    view.payments.find((payment) => payment.merchant === merchant),
  ).toMatchObject({
    decision: "candidate",
    amount: 1549,
    charges: expect.arrayContaining([
      expect.objectContaining({ source: "pdf", postedOn: "2026-09-09" }),
    ]),
  });
  const facts = async () => ({
    accounts: await db
      .select()
      .from(financialAccount)
      .where(eq(financialAccount.workspaceId, workspaceId)),
    transactions: await db
      .select()
      .from(transaction)
      .where(eq(transaction.workspaceId, workspaceId))
      .orderBy(transaction.id),
    imports: await db
      .select()
      .from(importBatch)
      .where(eq(importBatch.workspaceId, workspaceId)),
  });
  const before = await facts();
  expect(await confirmPattern(workspaceId, accountId, merchant, now)).toBe(
    "ok",
  );
  expect(
    await setPaymentIntent(workspaceId, accountId, merchant, "cancel"),
  ).toBe("ok");
  await Promise.all([
    refreshRecurringSeries(workspaceId, [accountId], now),
    refreshRecurringSeries(workspaceId, [accountId], now),
  ]);
  expect(
    (await listRecurringPayments(workspaceId, now)).payments.find(
      (payment) => payment.merchant === merchant,
    ),
  ).toMatchObject({
    decision: "confirmed",
    userIntent: "cancel",
    amount: 1549,
    actual: 1549,
  });
  expect((await listRecurringPayments(workspaceId, now)).summary.saving).toBe(
    18588,
  );
  expect(await facts()).toEqual(before);
  expect(
    (await facts()).imports.find((row) => row.id === batch.id),
  ).toMatchObject({
    status: "committed",
    rowsImported: 11,
  });
});
