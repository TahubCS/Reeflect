import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import {
  categoryRule,
  financialAccount,
  organization,
  transaction,
} from "@/lib/db/schema";
import { fixtures } from "../../../../tests/support/db-fixtures";
import { PAGE_SIZE, PRESET_CATEGORIES, type RuleInput } from "../domain/forms";
import {
  applyCategoryRules,
  createRule,
  deleteRule,
  ensureCategories,
  getCategorizationPage,
  listCategories,
  listRules,
  renameCategory,
  saveOverride,
  updateRule,
} from "./repository";

const f = fixtures();
let a: string;
let b: string;
let accountA: string;
let accountB: string;
let groceries: string;
let dining: string;
let foreignCategory: string;

async function account(workspaceId: string) {
  const [row] = await db
    .insert(financialAccount)
    .values({
      workspaceId,
      nickname: "Everyday",
      institutionName: "Synthetic bank",
      type: "checking",
      source: "synthetic",
      currentBalanceCents: 12345,
    })
    .returning();
  return row!.id;
}

async function add(
  workspaceId = a,
  accountId = accountA,
  descriptionRaw = "CORNER MARKET STORE #42 REF ABC123",
) {
  const [row] = await db
    .insert(transaction)
    .values({
      workspaceId,
      financialAccountId: accountId,
      descriptionRaw,
      postedOn: "2026-10-10",
      amountCents: -1234,
      source: "synthetic",
      fingerprint: uuidv7(),
    })
    .returning();
  return row!.id;
}
const raw = async (id: string) =>
  (await db.select().from(transaction).where(eq(transaction.id, id)))[0]!;
const input = (
  pattern: string,
  categoryId = groceries,
  priority = 100,
): RuleInput => ({ pattern, categoryId, matchType: "contains", priority });

beforeAll(async () => {
  a = await f.newWorkspace();
  b = await f.newWorkspace();
  await ensureCategories(a);
  await ensureCategories(b);
  accountA = await account(a);
  accountB = await account(b);
  const categories = await listCategories(a);
  groceries = categories.find((c) => c.name === "Groceries")!.id;
  dining = categories.find((c) => c.name === "Dining")!.id;
  foreignCategory = (await listCategories(b))[0]!.id;
});
afterAll(() => f.cleanUp());

describe("categories", () => {
  it("handles a workspace deleted before preset initialization", async () => {
    const workspace = await f.newWorkspace();
    await db.delete(organization).where(eq(organization.id, workspace));
    await ensureCategories(workspace);
    expect(await listCategories(workspace)).toEqual([]);
  });
  it("seeds every preset per workspace idempotently, even concurrently", async () => {
    const before = await listCategories(a);
    await Promise.all([ensureCategories(a), ensureCategories(a)]);
    expect(await listCategories(a)).toEqual(before);
    expect(before).toHaveLength(PRESET_CATEGORIES.length);
    expect((await listCategories(b)).map((c) => c.id)).not.toContain(groceries);
  });
  it("preserves renamed presets and rejects another workspace's category", async () => {
    expect(await renameCategory(a, dining, "Eating out")).toBe("ok");
    await ensureCategories(a);
    expect((await listCategories(a)).find((c) => c.id === dining)?.name).toBe(
      "Eating out",
    );
    expect(await renameCategory(a, foreignCategory, "Private")).toBe(
      "not_found",
    );
  });
  it("rejects duplicate category names without changing either category", async () => {
    expect(await renameCategory(a, dining, "groceries")).toBe("duplicate_name");
    expect((await listCategories(a)).find((c) => c.id === dining)?.name).toBe(
      "Eating out",
    );
  });
});

describe("automatic categories and manual choices", () => {
  it("categorizes existing transactions and leaves financial facts unchanged", async () => {
    const id = await add();
    const before = await raw(id);
    const [balanceBefore] = await db
      .select()
      .from(financialAccount)
      .where(eq(financialAccount.id, accountA));
    expect(await createRule(a, input("corner market"))).toBe("ok");
    const after = await raw(id);
    expect(after).toMatchObject({
      categoryId: groceries,
      categoryIsManual: false,
      merchantNormalized: "corner market",
    });
    for (const key of [
      "workspaceId",
      "financialAccountId",
      "postedOn",
      "amountCents",
      "descriptionRaw",
      "source",
      "status",
      "isTransfer",
      "transferPairId",
      "externalId",
      "fingerprint",
      "createdAt",
    ] as const) {
      expect(after[key]).toEqual(before[key]);
    }
    expect(
      (
        await db
          .select()
          .from(financialAccount)
          .where(eq(financialAccount.id, accountA))
      )[0],
    ).toEqual(balanceBefore);
    const page = await getCategorizationPage(a);
    expect(page.transactions.find((t) => t.id === id)).toMatchObject({
      categoryName: "Groceries",
      origin: "rule",
      amountCents: -1234,
    });
  });
  it("immediately categorizes a later import on read, then supports materializing just its ids", async () => {
    const later = await add();
    const untouched = await add(a, accountA, "Unknown merchant");
    expect((await raw(later)).categoryId).toBeNull();
    expect(
      (await getCategorizationPage(a)).transactions.find((t) => t.id === later),
    ).toMatchObject({ categoryId: groceries, origin: "rule" });
    await applyCategoryRules(a, [later]);
    expect((await raw(later)).categoryId).toBe(groceries);
    expect((await raw(untouched)).merchantNormalized).toBeNull();
    await applyCategoryRules(a, []);
    expect((await raw(untouched)).merchantNormalized).toBeNull();
  });
  it("preserves manual choices during higher priority rules and can return to automatic", async () => {
    const id = await add();
    expect(
      await saveOverride(a, id, { mode: "manual", categoryId: dining }),
    ).toBe("ok");
    expect(await createRule(a, input("corner", groceries, 500))).toBe("ok");
    expect(
      (await getCategorizationPage(a)).transactions.find((t) => t.id === id),
    ).toMatchObject({ categoryId: dining, origin: "manual" });
    expect((await raw(id)).categoryIsManual).toBe(true);
    expect(
      await saveOverride(a, id, { mode: "automatic", categoryId: null }),
    ).toBe("ok");
    expect((await raw(id)).categoryId).toBe(groceries);
    expect(
      (await getCategorizationPage(a)).transactions.find((t) => t.id === id)
        ?.origin,
    ).toBe("rule");
  });
  it("preserves manual Uncategorized over matching rules", async () => {
    const id = await add();
    await saveOverride(a, id, { mode: "manual", categoryId: null });
    await applyCategoryRules(a);
    expect((await raw(id)).categoryId).toBeNull();
    expect(
      (await getCategorizationPage(a)).transactions.find((t) => t.id === id),
    ).toMatchObject({ categoryName: "Uncategorized", origin: "manual" });
  });
  it("saves the choice and rule atomically and reuses an identical rule on resubmit", async () => {
    const id = await add(a, accountA, "CAFÉ #123");
    const another = await add(a, accountA, "CAFÉ STORE #999");
    const rule = { ...input("café", dining, 600), matchType: "exact" as const };
    const before = (await listRules(a)).length;
    expect(
      await saveOverride(a, id, { mode: "manual", categoryId: dining, rule }),
    ).toBe("ok");
    expect((await raw(another)).categoryId).toBe(dining);
    expect((await raw(id)).categoryIsManual).toBe(true);
    await saveOverride(a, id, { mode: "manual", categoryId: dining, rule });
    expect(await listRules(a)).toHaveLength(before + 1);
  });
  it("rolls back both the new rule and manual choice when the database rejects the write", async () => {
    const id = await add(a, accountA, "Rollback merchant");
    const before = await raw(id);
    const rules = await listRules(a);
    const original = db.transaction.bind(db);
    const injected = vi
      .spyOn(db, "transaction")
      .mockImplementationOnce((callback, config) =>
        original(async (tx) => {
          // Keep the real SQL transaction and rule INSERT, then fail its UPDATE.
          const failedUpdate = vi
            .spyOn(tx, "update")
            .mockImplementationOnce(() => {
              throw new Error("simulated database update failure");
            });
          try {
            return await callback(tx);
          } finally {
            failedUpdate.mockRestore();
          }
        }, config),
      );
    try {
      await expect(
        saveOverride(a, id, {
          mode: "manual",
          categoryId: dining,
          rule: input("rollback", dining),
        }),
      ).rejects.toThrow("simulated database update failure");
    } finally {
      injected.mockRestore();
    }
    expect(await raw(id)).toEqual(before);
    expect(await listRules(a)).toEqual(rules);
  });
  it("keeps oversized imported descriptions usable and preserves their manual choices", async () => {
    const id = await add(a, accountA, "x".repeat(2001));
    const unassigned = (await getCategorizationPage(a)).transactions.find(
      (t) => t.id === id,
    );
    expect(unassigned?.categoryName).toBe("Uncategorized");
    await applyCategoryRules(a, [id]);
    await saveOverride(a, id, { mode: "manual", categoryId: groceries });
    expect(
      (await getCategorizationPage(a)).transactions.find((t) => t.id === id),
    ).toMatchObject({ categoryId: groceries, origin: "manual" });
  });
});

describe("rule management", () => {
  it("edits and deletes a rule, recategorizing only automatic choices", async () => {
    const automatic = await add(a, accountA, "City transit");
    const manual = await add(a, accountA, "City transit");
    await saveOverride(a, manual, { mode: "manual", categoryId: groceries });
    await createRule(a, input("city transit", groceries));
    const rule = (await listRules(a)).find(
      (r) => r.pattern === "city transit",
    )!;
    expect(
      await updateRule(a, rule.id, {
        ...input("city transit", dining),
        matchType: "starts_with",
      }),
    ).toBe("ok");
    expect((await raw(automatic)).categoryId).toBe(dining);
    expect((await raw(manual)).categoryId).toBe(groceries);
    expect(await deleteRule(a, rule.id)).toBe("ok");
    expect((await raw(automatic)).categoryId).toBeNull();
    expect((await raw(manual)).categoryId).toBe(groceries);
    expect(await deleteRule(a, rule.id)).toBe("not_found");
    expect(await updateRule(a, rule.id, input("city"))).toBe("not_found");
  });
  it("enforces the engine's rule limit without saving part of an override", async () => {
    const workspace = await f.newWorkspace();
    await ensureCategories(workspace);
    const categoryId = (await listCategories(workspace))[0]!.id;
    const accountId = await account(workspace);
    const id = await add(workspace, accountId, "Full rules");
    await db.insert(categoryRule).values(
      Array.from({ length: 1000 }, (_, index) => ({
        workspaceId: workspace,
        categoryId,
        pattern: `merchant ${index}`,
        matchType: "exact" as const,
        priority: 100,
      })),
    );
    const before = await raw(id);
    expect(await createRule(workspace, input("another", categoryId))).toBe(
      "rule_limit",
    );
    expect(
      await saveOverride(workspace, id, {
        mode: "manual",
        categoryId,
        rule: input("another", categoryId),
      }),
    ).toBe("rule_limit");
    expect(await raw(id)).toEqual(before);
    expect(await listRules(workspace)).toHaveLength(1000);
  });
});

describe("workspace boundaries and cascades", () => {
  it("never reads or mutates another workspace's objects", async () => {
    const privateId = await add(b, accountB, "Private merchant");
    await createRule(b, input("private", foreignCategory));
    const privateRule = (await listRules(b))[0]!;
    const before = await raw(privateId);
    const beforeB = await getCategorizationPage(b);
    expect(
      (await getCategorizationPage(a)).transactions.map((t) => t.id),
    ).not.toContain(privateId);
    expect(
      await saveOverride(a, privateId, {
        mode: "manual",
        categoryId: groceries,
      }),
    ).toBe("not_found");
    const own = await add();
    expect(
      await saveOverride(a, own, {
        mode: "manual",
        categoryId: foreignCategory,
      }),
    ).toBe("not_found");
    expect(await createRule(a, input("private", foreignCategory))).toBe(
      "not_found",
    );
    expect(await updateRule(a, privateRule.id, input("private"))).toBe(
      "not_found",
    );
    const ownRule = (await listRules(a))[0]!;
    expect(
      await updateRule(a, ownRule.id, input("private", foreignCategory)),
    ).toBe("not_found");
    expect(await deleteRule(a, privateRule.id)).toBe("not_found");
    await applyCategoryRules(a, [privateId]);
    expect(await raw(privateId)).toEqual(before);
    expect(await getCategorizationPage(b)).toEqual(beforeB);
  });
  it("rejects cross-workspace category references at the database boundary", async () => {
    const id = await add();
    await expect(
      db
        .update(transaction)
        .set({ categoryId: foreignCategory })
        .where(eq(transaction.id, id)),
    ).rejects.toThrow();
    await expect(
      db.insert(categoryRule).values({
        workspaceId: a,
        categoryId: foreignCategory,
        pattern: "x",
        matchType: "exact",
        priority: 100,
      }),
    ).rejects.toThrow();
  });
  it("deletes categories, rules and transactions when a workspace is deleted", async () => {
    const workspace = await f.newWorkspace();
    await ensureCategories(workspace);
    const categoryId = (await listCategories(workspace))[0]!.id;
    const id = await add(workspace, await account(workspace));
    await saveOverride(workspace, id, {
      mode: "manual",
      categoryId,
      rule: input("corner", categoryId),
    });
    await db.delete(organization).where(eq(organization.id, workspace));
    expect(await listCategories(workspace)).toEqual([]);
    expect(await listRules(workspace)).toEqual([]);
    expect(
      await db
        .select()
        .from(transaction)
        .where(eq(transaction.workspaceId, workspace)),
    ).toEqual([]);
  });
  it("deleting an account removes categorized transactions and keeps workspace rules", async () => {
    const id = await add(a, await account(a), "Deleted account");
    await saveOverride(a, id, { mode: "manual", categoryId: groceries });
    const accountId = (await raw(id)).financialAccountId;
    const rules = await listRules(a);
    await db
      .delete(financialAccount)
      .where(
        and(
          eq(financialAccount.workspaceId, a),
          eq(financialAccount.id, accountId),
        ),
      );
    expect(
      await db.select().from(transaction).where(eq(transaction.id, id)),
    ).toEqual([]);
    expect(await listRules(a)).toEqual(rules);
  });
});

describe("pagination and bulk categorization", () => {
  it("paginates deterministically without duplicating or dropping transactions", async () => {
    const workspace = await f.newWorkspace();
    await ensureCategories(workspace);
    const accountId = await account(workspace);
    await db.insert(transaction).values(
      Array.from({ length: PAGE_SIZE + 2 }, (_, index) => ({
        workspaceId: workspace,
        financialAccountId: accountId,
        postedOn: "2026-10-10",
        amountCents: -index,
        descriptionRaw: `Merchant ${index}`,
        source: "synthetic" as const,
        fingerprint: uuidv7(),
      })),
    );
    const first = await getCategorizationPage(workspace);
    const second = await getCategorizationPage(workspace, 2);
    expect(first.transactions).toHaveLength(PAGE_SIZE);
    expect(first.hasNextPage).toBe(true);
    expect(second.transactions).toHaveLength(2);
    expect(second.hasNextPage).toBe(false);
    expect(
      new Set([...first.transactions, ...second.transactions].map((t) => t.id))
        .size,
    ).toBe(PAGE_SIZE + 2);
  });
  it("materializes across multiple batches and leaves manual choices alone", async () => {
    const workspace = await f.newWorkspace();
    await ensureCategories(workspace);
    const categoryId = (await listCategories(workspace))[0]!.id;
    const accountId = await account(workspace);
    const rows = await db
      .insert(transaction)
      .values(
        Array.from({ length: 501 }, () => ({
          workspaceId: workspace,
          financialAccountId: accountId,
          postedOn: "2026-10-10",
          amountCents: -1200,
          descriptionRaw: "Bulk market",
          source: "synthetic" as const,
          fingerprint: uuidv7(),
        })),
      )
      .returning({ id: transaction.id });
    await createRule(workspace, input("bulk", categoryId));
    expect(
      await db
        .select()
        .from(transaction)
        .where(
          and(
            eq(transaction.workspaceId, workspace),
            eq(transaction.categoryId, categoryId),
          ),
        ),
    ).toHaveLength(501);
    await saveOverride(workspace, rows[0]!.id, {
      mode: "manual",
      categoryId: null,
    });
    await applyCategoryRules(workspace);
    expect((await raw(rows[0]!.id)).categoryIsManual).toBe(true);
    expect((await raw(rows[0]!.id)).categoryId).toBeNull();
    expect(
      await db
        .select()
        .from(transaction)
        .where(
          inArray(
            transaction.id,
            rows.map((r) => r.id),
          ),
        ),
    ).toHaveLength(501);
  });
});
