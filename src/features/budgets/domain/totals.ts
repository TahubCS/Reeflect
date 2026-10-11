import {
  type CategoryRule,
  classifyStored,
  type StoredCategorization,
} from "@/features/categorization/client";
import {
  type Cents,
  ZERO,
  add,
  negate,
  ratio,
  subtract,
  sum,
} from "@/lib/money";
import { isSpendingCategory } from "./forms";

export type BudgetCategory = { id: string; name: string; presetKey: string };
export type Allocation = { categoryId: string; amountCents: Cents };
export type Activity = StoredCategorization & {
  postedOn: string;
  amountCents: Cents;
  status: "posted" | "pending";
  isTransfer: boolean;
};
export type Spending = {
  byCategory: ReadonlyMap<string, Cents>;
  uncategorized: Cents;
  recordedRows: number;
};
export type BudgetRow = BudgetCategory & {
  allocation: Cents | null;
  spent: Cents;
  remaining: Cents | null;
  progress: number | null;
};
export type BudgetTotals = {
  allocated: Cents;
  budgetedSpending: Cents;
  remaining: Cents;
  unbudgetedSpending: Cents;
  uncategorized: Cents;
  totalSpending: Cents;
  budgetCount: number;
  recordedRows: number;
};
export const emptySpending = (): Spending => ({
  byCategory: new Map(),
  uncategorized: ZERO,
  recordedRows: 0,
});

/** Paged reduction: inputs, including the previous page's totals, are immutable. */
export function aggregateSpending(
  rows: readonly Activity[],
  categories: readonly BudgetCategory[],
  rules: CategoryRule[],
  window: { from: string; to: string },
  initial = emptySpending(),
): Spending {
  const byCategory = new Map(initial.byCategory);
  const known = new Map(categories.map((c) => [c.id, c]));
  let uncategorized = initial.uncategorized;
  let recordedRows = initial.recordedRows;
  for (const row of rows) {
    if (
      row.status !== "posted" ||
      row.postedOn < window.from ||
      row.postedOn > window.to
    )
      continue;
    recordedRows += 1;
    if (row.isTransfer || row.amountCents === 0) continue;
    const result = classifyStored(row, rules);
    const category = known.get(result.categoryId ?? "");
    if (!category) {
      if (row.amountCents < 0)
        uncategorized = add(uncategorized, negate(row.amountCents));
      continue;
    }
    if (!isSpendingCategory(category.presetKey)) continue;
    byCategory.set(
      category.id,
      subtract(byCategory.get(category.id) ?? ZERO, row.amountCents),
    );
  }
  return { byCategory, uncategorized, recordedRows };
}

export function budgetOverview(
  categories: readonly BudgetCategory[],
  allocations: readonly Allocation[],
  spending: Spending,
): { rows: BudgetRow[]; totals: BudgetTotals } {
  const planned = new Map(
    allocations.map((a) => [a.categoryId, a.amountCents]),
  );
  const rows = categories
    .filter((c) => isSpendingCategory(c.presetKey))
    .map((category): BudgetRow => {
      const allocation = planned.get(category.id) ?? null;
      const spent = spending.byCategory.get(category.id) ?? ZERO;
      return {
        ...category,
        allocation,
        spent,
        remaining: allocation === null ? null : subtract(allocation, spent),
        progress:
          allocation === null
            ? null
            : allocation === 0
              ? spent > 0
                ? 100
                : 0
              : Math.max(
                  0,
                  Math.min(100, Math.round(ratio(spent, allocation) * 100)),
                ),
      };
    });
  const budgeted = rows.filter((r) => r.allocation !== null);
  const allocated = sum(budgeted.map((r) => r.allocation!));
  const budgetedSpending = sum(budgeted.map((r) => r.spent));
  const unbudgetedSpending = sum(
    rows.filter((r) => r.allocation === null).map((r) => r.spent),
  );
  return {
    rows,
    totals: {
      allocated,
      budgetedSpending,
      remaining: subtract(allocated, budgetedSpending),
      unbudgetedSpending,
      uncategorized: spending.uncategorized,
      totalSpending: add(
        add(budgetedSpending, unbudgetedSpending),
        spending.uncategorized,
      ),
      budgetCount: budgeted.length,
      recordedRows: spending.recordedRows,
    },
  };
}
