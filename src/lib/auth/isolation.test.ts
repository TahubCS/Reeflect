import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ACCOUNT_ENTRY_POINTS } from "@/features/accounts/server/entry-points";
import { CASHFLOW_ENTRY_POINTS } from "@/features/cashflow/server/entry-points";
import { BUDGET_ENTRY_POINTS } from "@/features/budgets/server/entry-points";
import { BILL_ENTRY_POINTS } from "@/features/bills/server/entry-points";
import { saveBill } from "@/features/bills";
import { CATEGORIZATION_ENTRY_POINTS } from "@/features/categorization/server/entry-points";
import {
  createRule,
  ensureCategories,
  listCategories,
  listRules,
} from "@/features/categorization/server/repository";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import {
  category,
  categoryRule,
  budget,
  billDetails,
  billCycle,
  billPayment,
  importBatch,
  plannedTransaction,
  recurringSeries,
  transaction,
} from "@/lib/db/schema";
import {
  createAccount,
  listAccounts,
} from "@/features/accounts/server/repository";
import { IMPORT_ENTRY_POINTS } from "@/features/imports/server/entry-points";
import { INSIGHTS_ENTRY_POINTS } from "@/features/insights/server/entry-points";
import { listPreviews } from "@/features/imports/server/repository";
import { MESSAGING_ENTRY_POINTS } from "@/features/messaging/server/entry-points";
import { TRANSACTION_ENTRY_POINTS } from "@/features/transactions/server/entry-points";
import { RECURRING_ENTRY_POINTS } from "@/features/recurring/server/entry-points";
import { createTransaction } from "@/features/transactions/server/repository";
import { createPlan } from "@/features/plans/server/repository";
import { cents } from "@/lib/money";
import {
  fixtures,
  isNotFound,
  isRedirect,
} from "../../../tests/support/db-fixtures";
import type { EntryPoint, EntryPointTarget } from "./entry-point";

// TEST-06, the workspace isolation matrix. Every feature's entry points are
// listed below; a new feature adds its `server/entry-points.ts` list here.
// User A is a member of workspace A only. Calling any entry point with
// workspace B's ids, or with A's workspace and B's object ids, must find
// nothing and change nothing in B.
const ENTRY_POINTS: EntryPoint[] = [
  ...ACCOUNT_ENTRY_POINTS,
  ...IMPORT_ENTRY_POINTS,
  ...MESSAGING_ENTRY_POINTS,
  ...TRANSACTION_ENTRY_POINTS,
  ...CATEGORIZATION_ENTRY_POINTS,
  ...INSIGHTS_ENTRY_POINTS,
  ...RECURRING_ENTRY_POINTS,
  ...CASHFLOW_ENTRY_POINTS,
  ...BUDGET_ENTRY_POINTS,
  ...BILL_ENTRY_POINTS,
];

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));
// The calendar's actions refresh the page in place, which needs a request.
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
// This matrix checks database ownership. Its synthetic preview has no stored
// CSV, so authorized cleanup must not contact object storage. Actual storage
// writes/cleanup are exercised by the separate storage/import suites.
vi.mock("@/lib/storage", () => ({ statementStore: () => null }));

const f = fixtures();
let userA: string;
let viewerB: string;
let a: EntryPointTarget;
let b: EntryPointTarget;

async function outcome(entry: EntryPoint, target: EntryPointTarget) {
  try {
    await entry.call(target);
    return "returned";
  } catch (error) {
    if (isNotFound(error)) return "not found";
    if (isRedirect(error)) return "redirected";
    throw error;
  }
}

async function snapshotB(executor: Pick<typeof db, "select"> = db) {
  // SQL row order is unspecified without ORDER BY. Compare every column in
  // a stable order so planner changes cannot look like unauthorized writes.
  return {
    billDetails: await executor
      .select()
      .from(billDetails)
      .where(eq(billDetails.workspaceId, b.workspaceId))
      .orderBy(billDetails.id),
    billCycles: await executor
      .select()
      .from(billCycle)
      .where(eq(billCycle.workspaceId, b.workspaceId))
      .orderBy(billCycle.id),
    billPayments: await executor
      .select()
      .from(billPayment)
      .where(eq(billPayment.workspaceId, b.workspaceId))
      .orderBy(billPayment.id),
    accounts: await listAccounts(b.workspaceId),
    budgets: await executor
      .select()
      .from(budget)
      .where(eq(budget.workspaceId, b.workspaceId))
      .orderBy(budget.id),
    categories: await executor
      .select()
      .from(category)
      .where(eq(category.workspaceId, b.workspaceId))
      .orderBy(category.id),
    rules: await executor
      .select()
      .from(categoryRule)
      .where(eq(categoryRule.workspaceId, b.workspaceId))
      .orderBy(categoryRule.id),
    recurring: await executor
      .select()
      .from(recurringSeries)
      .where(eq(recurringSeries.workspaceId, b.workspaceId))
      .orderBy(recurringSeries.id),
    transactions: await executor
      .select()
      .from(transaction)
      .where(eq(transaction.workspaceId, b.workspaceId))
      .orderBy(transaction.id),
    plans: await executor
      .select()
      .from(plannedTransaction)
      .where(eq(plannedTransaction.workspaceId, b.workspaceId))
      .orderBy(plannedTransaction.id),
    previews: await listPreviews(b.workspaceId),
  };
}

async function newTarget(workspaceId: string): Promise<EntryPointTarget> {
  const accountId = await createAccount(workspaceId, {
    type: "checking",
    institutionName: "Bank",
    nickname: "Isolation target",
    maskLast4: null,
    balanceCents: null,
  });
  await ensureCategories(workspaceId);
  const categoryId = (await listCategories(workspaceId))[0]!.id;
  await createRule(workspaceId, {
    categoryId,
    pattern: "Isolation target",
    matchType: "contains",
    priority: 100,
  });
  const ruleId = (await listRules(workspaceId))[0]!.id;
  const transactionId = await createTransaction(workspaceId, {
    description: "Isolation target",
    isTransfer: false,
    ledger: {
      accountId,
      postedOn: "2026-01-10",
      amountCents: cents(-500),
      status: "posted",
    },
  });
  // Dated in the past, so confirming it would write if it were allowed.
  const planId = await createPlan(workspaceId, {
    accountId,
    plannedOn: "2026-01-12",
    amountCents: cents(-700),
    description: "Isolation target",
    categoryId: null,
  });
  await saveBill(workspaceId, {
    accountId,
    merchant: "isolation target",
    name: "Isolation target",
    kind: "bill",
    amountMode: "variable",
    amountCents: 500,
    unit: "months",
    every: 1,
    nextOn: "2026-01-10",
    useHistory: false,
    autopay: false,
    liabilityAccountId: null,
    invoiceCents: 500,
  });
  const importBatchId = uuidv7();
  await db.insert(importBatch).values({
    id: importBatchId,
    workspaceId,
    financialAccountId: accountId,
    kind: "pdf",
    fileSha256: importBatchId,
    statementInstitution: "Bank",
    statementLast4: "0000",
    productName: "Checking",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    openingBalanceCents: 0,
    closingBalanceCents: 0,
    reconciliation: "passed",
    rowsParsed: 0,
    checks: [],
    csvObjectKey: `isolation/${importBatchId}.csv`,
    csvSha256: "0",
    status: "previewed",
  });
  return {
    workspaceId,
    accountId,
    transactionId: transactionId!,
    importBatchId,
    categoryId,
    ruleId,
    planId: planId!,
  };
}

beforeAll(async () => {
  userA = await f.newUser();
  const ownerB = await f.newUser();
  viewerB = await f.newUser();
  const workspaceA = await f.newWorkspace({ [userA]: "owner" });
  const workspaceB = await f.newWorkspace({
    [ownerB]: "owner",
    [viewerB]: "viewer",
  });
  a = await newTarget(workspaceA);
  b = await newTarget(workspaceB);
});

afterAll(async () => {
  await f.cleanUp();
});

describe.each(ENTRY_POINTS)("$name", (entry) => {
  it("finds nothing in a workspace the user is not a member of", async () => {
    getSession.mockResolvedValue({ user: { id: userA } });
    const before = await snapshotB();

    expect(await outcome(entry, b)).toBe("not found");
    expect(await snapshotB()).toEqual(before);
  });

  it("never reaches another workspace's objects through its own", async () => {
    getSession.mockResolvedValue({ user: { id: userA } });
    const before = await snapshotB();

    await outcome(entry, { ...a, accountId: b.accountId });
    await outcome(entry, { ...a, transactionId: b.transactionId });
    await outcome(entry, { ...a, importBatchId: b.importBatchId });
    await outcome(entry, {
      ...a,
      accountId: b.accountId,
      transactionId: b.transactionId,
      importBatchId: b.importBatchId,
    });
    await outcome(entry, { ...a, categoryId: b.categoryId });
    await outcome(entry, { ...a, ruleId: b.ruleId });
    await outcome(entry, { ...a, planId: b.planId });
    await outcome(entry, { ...b, workspaceId: a.workspaceId });

    expect(await snapshotB()).toEqual(before);
  });

  it(`refuses a role below ${entry.minimumRole}`, async () => {
    getSession.mockResolvedValue({ user: { id: viewerB } });
    const before = await snapshotB();

    const result = await outcome(entry, b);

    if (entry.minimumRole === "viewer") expect(result).not.toBe("not found");
    else expect(result).toBe("not found");
    expect(await snapshotB()).toEqual(before);
  });

  it("refuses a signed-out visitor", async () => {
    getSession.mockResolvedValue(null);

    expect(await outcome(entry, b)).toBe("not found");
  });
});

describe("the matrix", () => {
  it("compares the same workspace rows when PostgreSQL changes scan plans", async () => {
    await db.transaction(async (tx) => {
      // Planner settings are local to this transaction and change no data.
      await tx.execute(sql`SET LOCAL enable_indexscan = off`);
      await tx.execute(sql`SET LOCAL enable_bitmapscan = off`);
      const before = await snapshotB(tx);

      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      await tx.execute(sql`SET LOCAL enable_indexscan = on`);
      expect(await snapshotB(tx)).toEqual(before);
    });
  });

  it("covers at least one entry point per registered feature", () => {
    expect(ENTRY_POINTS.length).toBeGreaterThan(0);
    expect(new Set(ENTRY_POINTS.map((e) => e.name)).size).toBe(
      ENTRY_POINTS.length,
    );
  });
});
