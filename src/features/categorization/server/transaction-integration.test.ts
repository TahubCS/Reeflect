import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { financialAccount, transaction } from "@/lib/db/schema";
import { add, cents } from "@/lib/money";
import {
  createTransaction,
  updateTransaction,
} from "@/features/transactions/server/repository";
import { fixtures } from "../../../../tests/support/db-fixtures";
import {
  createRule,
  ensureCategories,
  getCategoryMetadata,
  listCategories,
  saveOverride,
} from "./repository";

const f = fixtures();
let workspace: string;
let accountId: string;
let groceries: string;
let transport: string;
const raw = async (id: string) =>
  (await db.select().from(transaction).where(eq(transaction.id, id)))[0]!;
const balance = async () =>
  (
    await db
      .select({ value: financialAccount.currentBalanceCents })
      .from(financialAccount)
      .where(eq(financialAccount.id, accountId))
  )[0]!.value;
const create = (description = "CORNER MARKET #42") =>
  createTransaction(workspace, {
    description,
    isTransfer: false,
    ledger: {
      accountId,
      postedOn: "2026-10-10",
      amountCents: cents(-1234),
      status: "posted",
    },
  });

beforeAll(async () => {
  workspace = await f.newWorkspace();
  await ensureCategories(workspace);
  const categories = await listCategories(workspace);
  groceries = categories.find((item) => item.name === "Groceries")!.id;
  transport = categories.find((item) => item.name === "Transport")!.id;
  const [account] = await db
    .insert(financialAccount)
    .values({
      workspaceId: workspace,
      nickname: "Manual balance",
      institutionName: "Synthetic bank",
      source: "manual",
      type: "checking",
      currentBalanceCents: 10000,
      balanceAsOf: "2026-10-10",
    })
    .returning();
  accountId = account!.id;
  await createRule(workspace, {
    categoryId: groceries,
    pattern: "corner market",
    matchType: "exact",
    priority: 100,
  });
  await createRule(workspace, {
    categoryId: transport,
    pattern: "city transit",
    matchType: "starts_with",
    priority: 100,
  });
});
afterAll(() => f.cleanUp());

describe("manual transaction integration", () => {
  it("saves automatic category metadata in the same transaction as creation and balance movement", async () => {
    const before = await balance();
    const id = (await create())!;
    expect(await raw(id)).toMatchObject({
      categoryId: groceries,
      categoryIsManual: false,
      merchantNormalized: "corner market",
      source: "manual",
      amountCents: -1234,
    });
    expect(await balance()).toBe(add(cents(before), cents(-1234)));
  });
  it("recategorizes an automatic transaction after its description changes without changing money", async () => {
    const id = (await create())!;
    const before = await balance();
    expect(
      await updateTransaction(workspace, id, {
        description: "CITY TRANSIT STORE #55",
        isTransfer: false,
        ledger: null,
      }),
    ).toBe("updated");
    expect(await raw(id)).toMatchObject({
      categoryId: transport,
      categoryIsManual: false,
      merchantNormalized: "city transit",
      amountCents: -1234,
    });
    expect(await balance()).toBe(before);
  });
  it("preserves a manual category and manual Uncategorized through transaction edits", async () => {
    const id = (await create())!;
    await saveOverride(workspace, id, {
      mode: "manual",
      categoryId: groceries,
    });
    await updateTransaction(workspace, id, {
      description: "City transit",
      isTransfer: true,
      ledger: null,
    });
    expect(await raw(id)).toMatchObject({
      categoryId: groceries,
      categoryIsManual: true,
      isTransfer: true,
      merchantNormalized: "city transit",
    });
    await saveOverride(workspace, id, { mode: "manual", categoryId: null });
    await updateTransaction(workspace, id, {
      description: "Corner market",
      isTransfer: false,
      ledger: null,
    });
    expect(await raw(id)).toMatchObject({
      categoryId: null,
      categoryIsManual: true,
      merchantNormalized: "corner market",
    });
  });
  it("does not assign another workspace's matching rule to a new transaction", async () => {
    const other = await f.newWorkspace();
    await ensureCategories(other);
    const categoryId = (await listCategories(other))[0]!.id;
    await createRule(other, {
      categoryId,
      pattern: "exclusive",
      matchType: "contains",
      priority: 100,
    });
    const id = (await create("Exclusive merchant"))!;
    expect((await raw(id)).categoryId).toBeNull();
    expect(await getCategoryMetadata(workspace, "Unknown merchant")).toEqual({
      categoryId: null,
      merchantNormalized: "unknown merchant",
    });
  });
});
