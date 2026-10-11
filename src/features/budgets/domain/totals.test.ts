import { describe, expect, it } from "vitest";
import { cents, sum } from "@/lib/money";
import { type CategoryRule } from "@/features/categorization/client";
import {
  aggregateSpending,
  budgetOverview,
  emptySpending,
  type Activity,
} from "./totals";
const cats = [
  { id: "food", name: "Food", presetKey: "groceries" },
  { id: "dining", name: "Dining", presetKey: "dining" },
  ...["income", "retirement", "investing"].map((key) => ({
    id: key,
    name: key,
    presetKey: key,
  })),
];
const window = { from: "2026-10-01", to: "2026-10-11" };
const row = (amount: number, extra: Partial<Activity> = {}): Activity => ({
  postedOn: "2026-10-01",
  amountCents: cents(amount),
  status: "posted",
  isTransfer: false,
  descriptionRaw: "Market",
  categoryId: "food",
  categoryIsManual: true,
  ...extra,
});
const rules: CategoryRule[] = [
  {
    id: "rule",
    categoryId: "dining",
    pattern: "Market",
    matchType: "contains",
    priority: 1,
  },
];
describe("monthly budget actuals", () => {
  it("nets refunds against purchases and recalculates an edited allocation", () => {
    const spent = aggregateSpending([row(-34000), row(2000)], cats, [], window);
    const before = budgetOverview(
      cats,
      [{ categoryId: "food", amountCents: cents(50000) }],
      spent,
    );
    expect(before.rows[0]).toMatchObject({
      spent: 32000,
      remaining: 18000,
      progress: 64,
    });
    expect(before.totals).toMatchObject({
      allocated: 50000,
      budgetedSpending: 32000,
      remaining: 18000,
      totalSpending: 32000,
      budgetCount: 1,
      recordedRows: 2,
    });
    expect(
      budgetOverview(
        cats,
        [{ categoryId: "food", amountCents: cents(55000) }],
        spent,
      ).rows[0]!.remaining,
    ).toBe(23000);
    expect(before.rows[0]!.allocation).toBe(50000);
  });
  it("counts only posted in-window activity and excludes marked transfers and zero rows", () => {
    const spent = aggregateSpending(
      [
        row(-100),
        row(-500, { postedOn: "2026-09-30" }),
        row(-500, { postedOn: "2026-10-12" }),
        row(-500, { status: "pending" }),
        row(-500, { isTransfer: true }),
        row(500, { isTransfer: true }),
        row(0),
      ],
      cats,
      [],
      window,
    );
    expect(spent.byCategory.get("food")).toBe(100);
    expect(spent.recordedRows).toBe(4);
  });
  it("uses effective rules and manual overrides, including Uncategorized", () => {
    const spent = aggregateSpending(
      [
        row(-100, { categoryIsManual: false }),
        row(-200),
        row(-300, { categoryId: null }),
        row(-400, { categoryId: "deleted" }),
        row(10000, { categoryId: null }),
      ],
      cats,
      rules,
      window,
    );
    expect(spent.byCategory.get("dining")).toBe(100);
    expect(spent.byCategory.get("food")).toBe(200);
    expect(spent.uncategorized).toBe(700);
  });
  it("excludes income and saving irrespective of sign, using keys rather than names", () => {
    const spent = aggregateSpending(
      cats
        .slice(2)
        .flatMap((c) => [
          row(-1000, { categoryId: c.id }),
          row(2000, { categoryId: c.id }),
        ]),
      cats,
      [],
      window,
    );
    expect([...spent.byCategory]).toEqual([]);
    expect(budgetOverview(cats, [], spent).rows.map((c) => c.name)).toEqual([
      "Food",
      "Dining",
    ]);
  });
  it("keeps excess refunds negative and does not produce negative progress", () => {
    const result = budgetOverview(
      cats,
      [{ categoryId: "food", amountCents: cents(100) }],
      aggregateSpending([row(-100), row(500)], cats, [], window),
    );
    expect(result.rows[0]).toMatchObject({
      spent: -400,
      remaining: 500,
      progress: 0,
    });
    expect(result.totals.totalSpending).toBe(-400);
  });
  it("distinguishes zero allocation from no budget and caps only visual progress", () => {
    const spent = aggregateSpending(
      [
        row(-1000),
        row(-50, { categoryId: "dining" }),
        row(-25, { categoryId: null }),
      ],
      cats,
      [],
      window,
    );
    const zero = budgetOverview(
      cats,
      [{ categoryId: "food", amountCents: cents(0) }],
      spent,
    );
    expect(zero.rows[0]).toMatchObject({
      allocation: 0,
      remaining: -1000,
      progress: 100,
    });
    expect(zero.rows[1]).toMatchObject({
      allocation: null,
      remaining: null,
      progress: null,
    });
    expect(zero.totals).toMatchObject({
      unbudgetedSpending: 50,
      uncategorized: 25,
      totalSpending: 1075,
    });
    expect(
      budgetOverview(
        cats,
        [{ categoryId: "food", amountCents: cents(500) }],
        spent,
      ).rows[0]!.progress,
    ).toBe(100);
    expect(
      budgetOverview(
        cats,
        [{ categoryId: "food", amountCents: cents(0) }],
        emptySpending(),
      ).rows[0]!.progress,
    ).toBe(0);
  });
  it("reduces pages immutably and totals equal their category components", () => {
    const all = Array.from({ length: 750 }, (_, i) =>
      row(i % 5 === 0 ? 1 : -3, {
        categoryId: i % 2 === 0 ? "food" : "dining",
      }),
    );
    const first = aggregateSpending(all.slice(0, 500), cats, [], window);
    const snapshot = [...first.byCategory];
    const paged = aggregateSpending(all.slice(500), cats, [], window, first);
    expect(paged).toEqual(aggregateSpending(all, cats, [], window));
    expect([...first.byCategory]).toEqual(snapshot);
    const result = budgetOverview(cats, [], paged);
    expect(result.totals.totalSpending).toBe(
      sum(result.rows.map((c) => c.spent)),
    );
    expect(result.totals.recordedRows).toBe(750);
  });
  it("rejects unsafe money rather than displaying a rounded total", () =>
    expect(() =>
      aggregateSpending(
        [row(-Number.MAX_SAFE_INTEGER), row(-1)],
        cats,
        [],
        window,
      ),
    ).toThrow("whole number of cents"));
});
