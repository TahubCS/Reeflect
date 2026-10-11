import "server-only";
import { and, asc, eq, gt, gte, lte, sql } from "drizzle-orm";
import { listCategories, listRules } from "@/features/categorization";
import { db } from "@/lib/db/client";
import {
  budget,
  category,
  financialAccount,
  organization,
  transaction,
} from "@/lib/db/schema";
import { cents } from "@/lib/money";
import {
  amountSchema,
  isSpendingCategory,
  targetSchema,
  type BudgetInput,
} from "../domain/forms";
import {
  canEditMonth,
  monthSchema,
  monthWindow,
  shiftMonth,
} from "../domain/months";
import {
  aggregateSpending,
  budgetOverview,
  emptySpending,
} from "../domain/totals";

// The caller authorizes first; every SQL query uses its verified workspace id.
// No budget operation modifies accounts, transactions or any other feature.
export const MAX_MONTH_ROWS = 20_000;
export const ACTIVITY_PAGE_SIZE = 500;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type WriteResult = "ok" | "not_found" | "read_only" | "not_spending";
const scope = (workspaceId: string, month: string, categoryId: string) =>
  and(
    eq(budget.workspaceId, workspaceId),
    eq(budget.month, month),
    eq(budget.categoryId, categoryId),
  );

export async function readBudgetMonth(
  workspaceId: string,
  month: string,
  today: string,
) {
  monthSchema.parse(month);
  const window = monthWindow(month, today);
  return db.transaction(
    async (tx) => {
      // A transaction has one PostgreSQL connection; keep its queries ordered.
      const categories = await listCategories(workspaceId, tx);
      const storedRules = await listRules(workspaceId, tx);
      const allocations = await tx
        .select({
          categoryId: budget.categoryId,
          amountCents: budget.amountCents,
        })
        .from(budget)
        .where(
          and(eq(budget.workspaceId, workspaceId), eq(budget.month, month)),
        );
      if (categories.length > 1_000 || storedRules.length > 1_000)
        throw new Error("Budget category/rule limit exceeded");
      // The domain's strict rule schema excludes the display-only categoryName.
      const rules = storedRules.map(
        ({ id, categoryId, pattern, matchType, priority }) => ({
          id,
          categoryId,
          pattern,
          matchType,
          priority,
        }),
      );
      let spending = emptySpending();
      let after: string | undefined;
      let count = 0;
      if (window.from <= window.to) {
        for (;;) {
          const rows = await tx
            .select({
              id: transaction.id,
              postedOn: transaction.postedOn,
              amountCents: transaction.amountCents,
              descriptionRaw: transaction.descriptionRaw,
              categoryId: transaction.categoryId,
              categoryIsManual: transaction.categoryIsManual,
              status: transaction.status,
              isTransfer: transaction.isTransfer,
            })
            .from(transaction)
            .innerJoin(
              financialAccount,
              and(
                eq(financialAccount.id, transaction.financialAccountId),
                eq(financialAccount.workspaceId, workspaceId),
              ),
            )
            .where(
              and(
                eq(transaction.workspaceId, workspaceId),
                eq(transaction.status, "posted"),
                gte(transaction.postedOn, window.from),
                lte(transaction.postedOn, window.to),
                after === undefined ? undefined : gt(transaction.id, after),
              ),
            )
            .orderBy(asc(transaction.id))
            .limit(ACTIVITY_PAGE_SIZE);
          count += rows.length;
          if (count > MAX_MONTH_ROWS)
            throw new Error("Budget monthly activity limit exceeded");
          spending = aggregateSpending(
            rows.map((row) => ({
              ...row,
              amountCents: cents(row.amountCents),
            })),
            categories,
            rules,
            window,
            spending,
          );
          if (rows.length < ACTIVITY_PAGE_SIZE) break;
          after = rows.at(-1)!.id;
        }
      }
      const previous = await tx
        .select({ presetKey: category.presetKey })
        .from(budget)
        .innerJoin(
          category,
          and(
            eq(category.id, budget.categoryId),
            eq(category.workspaceId, workspaceId),
          ),
        )
        .where(
          and(
            eq(budget.workspaceId, workspaceId),
            eq(budget.month, shiftMonth(month, -1)),
          ),
        );
      return {
        ...budgetOverview(
          categories,
          allocations.map((a) => ({ ...a, amountCents: cents(a.amountCents) })),
          spending,
        ),
        excludedCategories: categories.filter(
          (c) => !isSpendingCategory(c.presetKey),
        ),
        previousBudgetCount: previous.filter((c) =>
          isSpendingCategory(c.presetKey),
        ).length,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Serialize this feature's writes and hold the workspace through cascade deletion. */
async function lockWorkspace(tx: Tx, workspaceId: string): Promise<boolean> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`budget:${workspaceId}`}, 0))`,
  );
  const [workspace] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, workspaceId))
    .for("key share");
  return workspace !== undefined;
}

async function ownedCategory(
  tx: Tx,
  workspaceId: string,
  categoryId: string,
): Promise<WriteResult> {
  const [row] = await tx
    .select({ presetKey: category.presetKey })
    .from(category)
    .where(
      and(eq(category.workspaceId, workspaceId), eq(category.id, categoryId)),
    )
    .for("key share");
  return row === undefined
    ? "not_found"
    : isSpendingCategory(row.presetKey)
      ? "ok"
      : "not_spending";
}

export async function saveBudget(
  workspaceId: string,
  input: BudgetInput,
  today: string,
): Promise<WriteResult> {
  targetSchema.parse(input);
  amountSchema.parse(input.amountCents);
  if (!canEditMonth(input.month, today)) return "read_only";
  return db.transaction(async (tx) => {
    if (!(await lockWorkspace(tx, workspaceId))) return "not_found";
    const categoryResult = await ownedCategory(
      tx,
      workspaceId,
      input.categoryId,
    );
    if (categoryResult !== "ok") return categoryResult;
    await tx
      .insert(budget)
      .values({
        workspaceId,
        month: input.month,
        categoryId: input.categoryId,
        amountCents: input.amountCents,
      })
      .onConflictDoUpdate({
        target: [budget.workspaceId, budget.month, budget.categoryId],
        set: { amountCents: input.amountCents, updatedAt: new Date() },
      });
    return "ok";
  });
}

export async function removeBudget(
  workspaceId: string,
  month: string,
  categoryId: string,
  today: string,
): Promise<WriteResult> {
  targetSchema.parse({ month, categoryId });
  if (!canEditMonth(month, today)) return "read_only";
  return db.transaction(async (tx) => {
    if (!(await lockWorkspace(tx, workspaceId))) return "not_found";
    const categoryResult = await ownedCategory(tx, workspaceId, categoryId);
    if (categoryResult !== "ok") return categoryResult;
    await tx.delete(budget).where(scope(workspaceId, month, categoryId));
    return "ok";
  });
}

export async function copyPreviousBudgets(
  workspaceId: string,
  month: string,
  today: string,
): Promise<{ result: WriteResult; copied: number }> {
  monthSchema.parse(month);
  if (!canEditMonth(month, today)) return { result: "read_only", copied: 0 };
  return db.transaction(async (tx) => {
    if (!(await lockWorkspace(tx, workspaceId)))
      return { result: "not_found", copied: 0 };
    const rows = await tx
      .select({
        categoryId: budget.categoryId,
        presetKey: category.presetKey,
        amountCents: budget.amountCents,
      })
      .from(budget)
      .innerJoin(
        category,
        and(
          eq(category.id, budget.categoryId),
          eq(category.workspaceId, workspaceId),
        ),
      )
      .where(
        and(
          eq(budget.workspaceId, workspaceId),
          eq(budget.month, shiftMonth(month, -1)),
        ),
      );
    const values = rows
      .filter((r) => isSpendingCategory(r.presetKey))
      .map((r) => ({
        workspaceId,
        month,
        categoryId: r.categoryId,
        amountCents: r.amountCents,
      }));
    if (!values.length) return { result: "ok", copied: 0 };
    const inserted = await tx
      .insert(budget)
      .values(values)
      .onConflictDoNothing({
        target: [budget.workspaceId, budget.month, budget.categoryId],
      })
      .returning({ id: budget.id });
    return { result: "ok", copied: inserted.length };
  });
}
