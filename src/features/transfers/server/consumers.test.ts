import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import {
  recurringSeries,
  financialAccount,
  transaction,
} from "@/lib/db/schema";
import { fixtures } from "../../../../tests/support/db-fixtures";
import { ensureCategories, listCategories } from "@/features/categorization";
import { readBudgetMonth } from "@/features/budgets";
import { loadCashflowData, summarize } from "@/features/cashflow";
import { buildMonth } from "@/features/cashflow/domain/cashflow";
import { loadWorkspaceData } from "@/features/insights/server";
import { periodEnding, workspaceMeasures } from "@/features/insights";
import { listRecurringPayments } from "@/features/recurring";
import { reviewQuery, type ReviewWrite } from "../domain/review";
import { readReview, writeReview } from "./repository";
const f = fixtures(),
  today = "2026-10-11",
  now = new Date(`${today}T16:00:00Z`);
afterAll(() => f.cleanUp());
async function setup() {
  const ws = await f.newWorkspace();
  await ensureCategories(ws);
  const categories = await listCategories(ws);
  const accounts = await db
    .insert(financialAccount)
    .values([
      {
        workspaceId: ws,
        institutionName: "Test",
        type: "checking" as const,
        nickname: "Cash",
        source: "synthetic",
        currentBalanceCents: 50000,
        balanceAsOf: today,
      },
      {
        workspaceId: ws,
        institutionName: "Test",
        type: "credit_card" as const,
        nickname: "Card",
        source: "synthetic",
        currentBalanceCents: -4500,
        balanceAsOf: today,
      },
      {
        workspaceId: ws,
        institutionName: "Test",
        type: "savings" as const,
        nickname: "Savings",
        source: "synthetic",
        currentBalanceCents: 10001,
        balanceAsOf: today,
      },
    ])
    .returning();
  return {
    ws,
    cash: accounts[0]!.id,
    card: accounts[1]!.id,
    savings: accounts[2]!.id,
    category: (key: string) => categories.find((c) => c.presetKey === key)!.id,
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function add(
  fx: Fixture,
  accountId: string,
  amountCents: number,
  extra: Partial<typeof transaction.$inferInsert> = {},
) {
  const [row] = await db
    .insert(transaction)
    .values({
      workspaceId: fx.ws,
      financialAccountId: accountId,
      postedOn: "2026-10-05",
      amountCents,
      descriptionRaw: "Activity",
      categoryId: fx.category("groceries"),
      categoryIsManual: true,
      source: "csv",
      fingerprint: crypto.randomUUID(),
      ...extra,
    })
    .returning();
  return row!.id;
}
async function expected(fx: Fixture, ids: string[]) {
  return Promise.all(
    ids.map(
      async (source) =>
        (
          await readReview(
            fx.ws,
            reviewQuery({ view: "all", source, from: "2026-07-01" }, today)!,
            today,
          )
        ).rows[0]!.row,
    ),
  );
}
async function figures(fx: Fixture) {
  const calendar = await loadCashflowData(fx.ws, now);
  return {
    budget: await readBudgetMonth(fx.ws, "2026-10", today),
    summary: summarize(calendar.data, today),
    daily: buildMonth(calendar.data, { year: 2026, month: 10 }, today).days.map(
      (d) => d.endBalance,
    ),
    insights: workspaceMeasures(
      await loadWorkspaceData(fx.ws, "2026-09-12"),
      periodEnding(today, 30),
    ),
  };
}
describe("financial consumers of saved transfer metadata", () => {
  it("changes actual spending and income figures, preserves savings semantics and every daily balance through pair/detach/normal activity", async () => {
    const fx = await setup();
    await add(fx, fx.cash, 0, { postedOn: "2026-09-12", categoryId: null });
    await add(fx, fx.card, -4500, { descriptionRaw: "Groceries purchase" });
    await add(fx, fx.cash, 100000, {
      categoryId: fx.category("income"),
      descriptionRaw: "Salary",
    });
    await add(fx, fx.cash, -3000, {
      categoryId: fx.category("retirement"),
      descriptionRaw: "Retirement saving",
      isTransfer: true,
    });
    const repayment = [
      await add(fx, fx.cash, -20000),
      await add(fx, fx.card, 20000, {
        categoryId: null,
        categoryIsManual: false,
      }),
    ];
    const saving = [
      await add(fx, fx.cash, -10001),
      await add(fx, fx.savings, 10001, {
        categoryId: null,
        categoryIsManual: false,
      }),
    ];
    const before = await figures(fx),
      accounts = await db
        .select()
        .from(financialAccount)
        .where(eq(financialAccount.workspaceId, fx.ws));
    expect(before.budget.totals.totalSpending).toBe(34501);
    for (const ids of [repayment, saving])
      expect(
        await writeReview(
          fx.ws,
          {
            operation: "pair",
            expected: await expected(fx, ids),
            confirmed: true,
          },
          today,
        ),
      ).toBe("ok");
    const after = await figures(fx);
    expect(after.budget.totals.totalSpending).toBe(4500);
    expect(after.summary).toMatchObject({
      balanceToday: 60001,
      monthIn: 100000,
      monthOut: 4500,
    });
    expect(after.insights).toMatchObject({
      takeHome: 101458,
      spending: 4566,
      saved: 13191,
      byCategory: { groceries: 4566 },
    });
    expect(after.insights?.lowestBalance).toBe(before.insights?.lowestBalance);
    expect(after.daily).toEqual(before.daily);
    expect(
      await db
        .select()
        .from(financialAccount)
        .where(eq(financialAccount.workspaceId, fx.ws)),
    ).toEqual(accounts);
    const members = (
      await readReview(
        fx.ws,
        reviewQuery({ source: repayment[0], view: "pairs" }, today)!,
        today,
      )
    ).rows[0]!.members;
    expect(
      await writeReview(
        fx.ws,
        { operation: "detach", expected: members, confirmed: true },
        today,
      ),
    ).toBe("ok");
    expect(await figures(fx)).toEqual(after);
    for (const id of repayment) {
      const request: ReviewWrite = {
        operation: "label",
        expected: await expected(fx, [id]),
        transfer: false,
        confirmed: true,
      };
      expect(await writeReview(fx.ws, request, today)).toBe("ok");
    }
    const restored = await figures(fx);
    expect(restored.budget.totals.totalSpending).toBe(24500);
    expect(restored.summary).toMatchObject({
      monthIn: 120000,
      monthOut: 24500,
      balanceToday: 60001,
    });
    expect(restored.daily).toEqual(before.daily);
  });
  it("excludes labelled repayments from recurring pattern evidence without rewriting or refreshing saved series", async () => {
    const fx = await setup(),
      ids = [];
    const saved = await db
      .select()
      .from(recurringSeries)
      .where(eq(recurringSeries.workspaceId, fx.ws));
    for (const postedOn of ["2026-07-05", "2026-08-05", "2026-09-05"])
      ids.push(
        await add(fx, fx.cash, -20000, {
          descriptionRaw: "Card repayment",
          categoryId: fx.category("utilities"),
          postedOn,
        }),
      );
    expect((await listRecurringPayments(fx.ws, now)).summary.candidates).toBe(
      1,
    );
    for (const id of ids)
      expect(
        await writeReview(
          fx.ws,
          {
            operation: "label",
            expected: await expected(fx, [id]),
            transfer: true,
            confirmed: true,
          },
          today,
        ),
      ).toBe("ok");
    const result = await listRecurringPayments(fx.ws, now);
    expect(result.payments).toEqual([]);
    expect(result.summary).toMatchObject({
      candidates: 0,
      monthly: 0,
      yearly: 0,
      actual: 0,
    });
    expect(
      await db
        .select()
        .from(recurringSeries)
        .where(eq(recurringSeries.workspaceId, fx.ws)),
    ).toEqual(saved);
  });
});
