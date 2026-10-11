import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ensureCategories, listCategories } from "@/features/categorization";
import * as categorization from "@/features/categorization";
import { db, pool } from "@/lib/db/client";
import {
  budget,
  category,
  categoryRule,
  financialAccount,
  organization,
  transaction,
} from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { fixtures } from "../../../../tests/support/db-fixtures";
import {
  copyPreviousBudgets,
  readBudgetMonth,
  removeBudget,
  saveBudget,
} from "./repository";

const f = fixtures();
const TODAY = "2026-10-11";
const MONTH = "2026-10";
async function setup() {
  const ws = await f.newWorkspace();
  await ensureCategories(ws);
  const categories = await listCategories(ws);
  const [account] = await db
    .insert(financialAccount)
    .values({
      workspaceId: ws,
      institutionName: "Test bank",
      type: "checking",
      nickname: "Checking",
      source: "synthetic",
      currentBalanceCents: 50000,
    })
    .returning();
  const key = (name: string) =>
    categories.find((c) => c.presetKey === name)!.id;
  return { ws, accountId: account!.id, categories, key };
}
async function activity(
  target: Awaited<ReturnType<typeof setup>>,
  amountCents: number,
  extra: Partial<typeof transaction.$inferInsert> = {},
) {
  const [row] = await db
    .insert(transaction)
    .values({
      workspaceId: target.ws,
      financialAccountId: target.accountId,
      postedOn: "2026-10-01",
      amountCents,
      descriptionRaw: "Market",
      categoryId: target.key("groceries"),
      categoryIsManual: true,
      source: "csv",
      fingerprint: crypto.randomUUID(),
      ...extra,
    })
    .returning();
  return row!;
}
const input = (categoryId: string, amount = 50000, month = MONTH) => ({
  categoryId,
  amountCents: cents(amount),
  month,
});
const allocations = (workspaceId: string) =>
  db
    .select()
    .from(budget)
    .where(eq(budget.workspaceId, workspaceId))
    .orderBy(budget.id);
afterAll(() => f.cleanUp());

describe("monthly budgets on real PostgreSQL", () => {
  it("returns no-data totals without initializing categories on read", async () => {
    const ws = await f.newWorkspace();
    const data = await readBudgetMonth(ws, MONTH, TODAY);
    expect(data.rows).toEqual([]);
    expect(data.totals).toMatchObject({
      recordedRows: 0,
      allocated: 0,
      budgetCount: 0,
    });
    expect(await listCategories(ws)).toEqual([]);
  });
  it("persists allocations, recalculates edits and preserves other months and ledger facts", async () => {
    const a = await setup();
    await activity(a, -34000);
    await activity(a, 2000);
    await db.insert(budget).values({
      workspaceId: a.ws,
      ...input(a.key("groceries"), 45000, "2026-09"),
    });
    const before = {
      accounts: await db
        .select()
        .from(financialAccount)
        .where(eq(financialAccount.workspaceId, a.ws)),
      transactions: await db
        .select()
        .from(transaction)
        .where(eq(transaction.workspaceId, a.ws))
        .orderBy(transaction.id),
    };
    expect(await saveBudget(a.ws, input(a.key("groceries")), TODAY)).toBe("ok");
    expect(
      (await readBudgetMonth(a.ws, MONTH, TODAY)).rows.find(
        (r) => r.id === a.key("groceries"),
      ),
    ).toMatchObject({ spent: 32000, allocation: 50000, remaining: 18000 });
    await saveBudget(a.ws, input(a.key("groceries"), 55000), TODAY);
    expect(
      (await readBudgetMonth(a.ws, MONTH, TODAY)).rows.find(
        (r) => r.id === a.key("groceries"),
      )!.remaining,
    ).toBe(23000);
    expect(
      (await allocations(a.ws)).find((r) => r.month === "2026-09")!.amountCents,
    ).toBe(45000);
    expect({
      accounts: await db
        .select()
        .from(financialAccount)
        .where(eq(financialAccount.workspaceId, a.ws)),
      transactions: await db
        .select()
        .from(transaction)
        .where(eq(transaction.workspaceId, a.ws))
        .orderBy(transaction.id),
    }).toEqual(before);
  });
  it("rejects another workspace's categories, absent workspaces and non-spending allocations", async () => {
    const a = await setup();
    const b = await setup();
    const missing = crypto.randomUUID();
    expect(await saveBudget(a.ws, input(b.key("groceries")), TODAY)).toBe(
      "not_found",
    );
    expect(await removeBudget(a.ws, MONTH, b.key("groceries"), TODAY)).toBe(
      "not_found",
    );
    for (const key of ["income", "retirement", "investing"]) {
      expect(await saveBudget(a.ws, input(a.key(key)), TODAY)).toBe(
        "not_spending",
      );
      expect(await removeBudget(a.ws, MONTH, a.key(key), TODAY)).toBe(
        "not_spending",
      );
    }
    expect(await saveBudget(missing, input(a.key("groceries")), TODAY)).toBe(
      "not_found",
    );
    expect(await removeBudget(missing, MONTH, a.key("groceries"), TODAY)).toBe(
      "not_found",
    );
    expect(await copyPreviousBudgets(missing, MONTH, TODAY)).toEqual({
      result: "not_found",
      copied: 0,
    });
    expect(await allocations(a.ws)).toEqual([]);
    expect(await allocations(b.ws)).toEqual([]);
  });
  it("the database independently rejects foreign categories, negative/excess amounts and invalid months", async () => {
    const a = await setup();
    const b = await setup();
    await expect(
      db
        .insert(budget)
        .values({ workspaceId: a.ws, ...input(b.key("groceries")) }),
    ).rejects.toThrow();
    for (const amountCents of [-1, 10000000001])
      await expect(
        db.insert(budget).values({
          workspaceId: a.ws,
          ...input(a.key("groceries")),
          amountCents,
        }),
      ).rejects.toThrow();
    await expect(
      db.insert(budget).values({
        workspaceId: a.ws,
        ...input(a.key("groceries")),
        month: "2026-13",
      }),
    ).rejects.toThrow();
  });
  it("is unique under repeated and concurrent saves, and removal can be repeated safely", async () => {
    const a = await setup();
    const id = a.key("groceries");
    expect(
      await Promise.all(
        Array.from({ length: 10 }, () => saveBudget(a.ws, input(id, 0), TODAY)),
      ),
    ).toEqual(Array(10).fill("ok"));
    expect(await allocations(a.ws)).toHaveLength(1);
    expect(
      (await readBudgetMonth(a.ws, MONTH, TODAY)).rows.find((r) => r.id === id)!
        .allocation,
    ).toBe(0);
    await removeBudget(a.ws, MONTH, id, TODAY);
    await removeBudget(a.ws, MONTH, id, TODAY);
    expect(await allocations(a.ws)).toEqual([]);
    await saveBudget(a.ws, input(id, 100), TODAY);
    expect(await allocations(a.ws)).toHaveLength(1);
  });
  it("refuses historical or distant-future writes while allowing next-month plans", async () => {
    const a = await setup();
    const id = a.key("groceries");
    for (const month of ["2026-09", "2026-12"]) {
      expect(await saveBudget(a.ws, input(id, 100, month), TODAY)).toBe(
        "read_only",
      );
      expect(await removeBudget(a.ws, month, id, TODAY)).toBe("read_only");
      expect(await copyPreviousBudgets(a.ws, month, TODAY)).toEqual({
        result: "read_only",
        copied: 0,
      });
    }
    await saveBudget(a.ws, input(id, 100, "2026-11"), TODAY);
    await activity(a, -500);
    expect(
      (await readBudgetMonth(a.ws, "2026-11", TODAY)).totals,
    ).toMatchObject({ allocated: 100, totalSpending: 0, recordedRows: 0 });
  });
  it("copies only missing allocations atomically and idempotently, preserving zero and excluding savings", async () => {
    const a = await setup();
    await db.insert(budget).values(
      ["groceries", "dining", "income"].map((key) => ({
        workspaceId: a.ws,
        ...input(a.key(key), 12000, "2026-09"),
      })),
    );
    await saveBudget(a.ws, input(a.key("groceries"), 0), TODAY);
    expect(
      (await readBudgetMonth(a.ws, MONTH, TODAY)).previousBudgetCount,
    ).toBe(2);
    const results = await Promise.all([
      copyPreviousBudgets(a.ws, MONTH, TODAY),
      copyPreviousBudgets(a.ws, MONTH, TODAY),
    ]);
    expect(results.map((r) => r.copied).sort()).toEqual([0, 1]);
    const now = (await allocations(a.ws)).filter((r) => r.month === MONTH);
    expect(now).toHaveLength(2);
    expect(
      now.find((r) => r.categoryId === a.key("groceries"))!.amountCents,
    ).toBe(0);
    const b = await setup();
    expect(await copyPreviousBudgets(b.ws, MONTH, TODAY)).toEqual({
      result: "ok",
      copied: 0,
    });
  });
  it("rolls back a failed copy without leaving some categories copied", async () => {
    const a = await setup();
    await db.insert(budget).values(
      ["groceries", "dining"].map((key) => ({
        workspaceId: a.ws,
        ...input(a.key(key), 12000, "2026-09"),
      })),
    );
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const trigger = `budget_failure_${suffix}`;
    const client = await pool.connect();
    try {
      await client.query(
        `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated budget copy failure'; END $$`,
      );
      await client.query(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON budget FOR EACH ROW WHEN (NEW.workspace_id = '${a.ws}' AND NEW.month = '${MONTH}' AND NEW.category_id = '${a.key("dining")}') EXECUTE FUNCTION ${trigger}()`,
      );
      await expect(copyPreviousBudgets(a.ws, MONTH, TODAY)).rejects.toThrow();
      expect(
        (await allocations(a.ws)).filter((r) => r.month === MONTH),
      ).toEqual([]);
    } finally {
      await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON budget`);
      await client.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
      client.release();
    }
  });
  it("reads effective categories, including rules changed after an import and renamed presets", async () => {
    const a = await setup();
    await activity(a, -1000, { categoryIsManual: false });
    await activity(a, -2000);
    await activity(a, -500, { categoryId: null });
    await db.insert(categoryRule).values({
      workspaceId: a.ws,
      categoryId: a.key("dining"),
      pattern: "Market",
      matchType: "exact",
      priority: 100,
    });
    await db
      .update(category)
      .set({ name: "Food at home" })
      .where(eq(category.id, a.key("groceries")));
    await saveBudget(a.ws, input(a.key("groceries")), TODAY);
    const data = await readBudgetMonth(a.ws, MONTH, TODAY);
    expect(data.rows.find((r) => r.id === a.key("groceries"))).toMatchObject({
      name: "Food at home",
      spent: 2000,
      allocation: 50000,
    });
    expect(data.rows.find((r) => r.id === a.key("dining"))!.spent).toBe(1000);
    expect(data.totals.uncategorized).toBe(500);
  });
  it("counts card purchases, excludes paired transfers/pending/future activity, and reads only owned accounts", async () => {
    const a = await setup();
    const b = await setup();
    const [card] = await db
      .insert(financialAccount)
      .values({
        workspaceId: a.ws,
        institutionName: "Test bank",
        type: "credit_card",
        nickname: "Card",
        source: "synthetic",
      })
      .returning();
    await activity(a, -1000, { financialAccountId: card!.id });
    for (const amountCents of [-1000, 1000])
      await activity(a, amountCents, {
        isTransfer: true,
        transferPairId: crypto.randomUUID(),
      });
    await activity(a, -2000, { status: "pending" });
    await activity(a, -2000, { postedOn: "2026-10-12" });
    await activity(a, -2000, { financialAccountId: b.accountId });
    await activity(b, -9000);
    expect(
      (await readBudgetMonth(a.ws, MONTH, TODAY)).totals.totalSpending,
    ).toBe(1000);
    expect(
      (await readBudgetMonth(b.ws, MONTH, TODAY)).totals.totalSpending,
    ).toBe(9000);
  });
  it("reads every page of a busy month within a year of history", async () => {
    const a = await setup();
    const values = Array.from({ length: 620 }, (_, i) => ({
      workspaceId: a.ws,
      financialAccountId: a.accountId,
      postedOn: "2026-10-01",
      amountCents: -100,
      descriptionRaw: "Market",
      categoryId: a.key("groceries"),
      categoryIsManual: true,
      source: "csv" as const,
      fingerprint: `row:${i}`,
    }));
    await db.insert(transaction).values(values);
    await db.insert(transaction).values(
      Array.from({ length: 12 }, (_, i) => ({
        ...values[0]!,
        postedOn: `2025-${String(i + 1).padStart(2, "0")}-01`,
        fingerprint: `history:${i}`,
        amountCents: -90000,
      })),
    );
    expect((await readBudgetMonth(a.ws, MONTH, TODAY)).totals).toMatchObject({
      totalSpending: 62000,
      recordedRows: 620,
    });
    expect(
      (await readBudgetMonth(a.ws, "2025-01", TODAY)).totals.totalSpending,
    ).toBe(90000);
  });
  it("holds one snapshot when rules and ledger activity change during a paged read", async () => {
    const a = await setup();
    await db.execute(
      sql`INSERT INTO "transaction" (id,workspace_id,financial_account_id,posted_on,amount_cents,description_raw,source,fingerprint) SELECT gen_random_uuid()::text, ${a.ws}, ${a.accountId}, '2026-10-01', -100, 'Market', 'csv', n::text FROM generate_series(1,501) n`,
    );
    const original = categorization.listRules;
    const spy = vi
      .spyOn(categorization, "listRules")
      .mockImplementation(async (ws, executor) => {
        const captured = await original(ws, executor);
        await db.insert(categoryRule).values({
          workspaceId: ws,
          categoryId: a.key("groceries"),
          pattern: "Market",
          matchType: "exact",
          priority: 1,
        });
        await activity(a, -100, { categoryIsManual: false });
        return captured;
      });
    try {
      const result = await readBudgetMonth(a.ws, MONTH, TODAY);
      expect(result.totals).toMatchObject({
        recordedRows: 501,
        uncategorized: 50100,
      });
    } finally {
      spy.mockRestore();
    }
    expect(
      (await readBudgetMonth(a.ws, MONTH, TODAY)).rows.find(
        (r) => r.id === a.key("groceries"),
      )!.spent,
    ).toBe(50200);
  });
  it("fails clearly on excessive history instead of showing a partial total", async () => {
    const a = await setup();
    await db.execute(
      sql`INSERT INTO "transaction" (id,workspace_id,financial_account_id,posted_on,amount_cents,description_raw,source,fingerprint) SELECT gen_random_uuid()::text, ${a.ws}, ${a.accountId}, '2026-10-01', -100, 'Market', 'csv', n::text FROM generate_series(1,20001) n`,
    );
    await expect(readBudgetMonth(a.ws, MONTH, TODAY)).rejects.toThrow(
      "monthly activity limit exceeded",
    );
  }, 30_000);
  it.each(["categories", "rules"])(
    "fails clearly on excessive %s without returning partial totals",
    async (kind) => {
      const a = await setup();
      if (kind === "categories") {
        await db.insert(category).values(
          Array.from({ length: 983 }, (_, n) => ({
            workspaceId: a.ws,
            name: `Extra ${n}`,
            presetKey: `fixture_${n}`,
            sortOrder: 100 + n,
          })),
        );
      } else {
        await db.insert(categoryRule).values(
          Array.from({ length: 1001 }, () => ({
            workspaceId: a.ws,
            categoryId: a.key("groceries"),
            pattern: "Market",
            matchType: "exact" as const,
          })),
        );
      }
      await expect(readBudgetMonth(a.ws, MONTH, TODAY)).rejects.toThrow(
        "Budget category/rule limit exceeded",
      );
    },
  );
  it("cascades category/workspace deletion and leaves another workspace intact", async () => {
    const a = await setup();
    const b = await setup();
    await saveBudget(a.ws, input(a.key("groceries")), TODAY);
    await saveBudget(b.ws, input(b.key("groceries")), TODAY);
    await db.delete(category).where(eq(category.id, a.key("groceries")));
    expect(await allocations(a.ws)).toEqual([]);
    await saveBudget(a.ws, input(a.key("dining")), TODAY);
    await db.delete(organization).where(eq(organization.id, a.ws));
    expect(await allocations(a.ws)).toEqual([]);
    expect(await allocations(b.ws)).toHaveLength(1);
  });
});
