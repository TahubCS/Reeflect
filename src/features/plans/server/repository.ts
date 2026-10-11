import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  classifyStored,
  listActiveRules,
  listCategories,
} from "@/features/categorization";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import {
  category,
  financialAccount,
  plannedTransaction,
} from "@/lib/db/schema";
import { cents } from "@/lib/money";
import type { PlanInput, PlannedSummary } from "../domain/plan-input";

// Every function takes the verified workspace id first and filters on it
// (ARCH-04). Callers authorize with `requireWorkspaceAccess` before calling.
// Plans never move an account's balance (ADR-102).

const inWorkspace = (workspaceId: string, planId: string) =>
  and(
    eq(plannedTransaction.workspaceId, workspaceId),
    eq(plannedTransaction.id, planId),
  );

const columns = {
  id: plannedTransaction.id,
  accountId: plannedTransaction.financialAccountId,
  plannedOn: plannedTransaction.plannedOn,
  amountCents: plannedTransaction.amountCents,
  description: plannedTransaction.description,
  categoryId: plannedTransaction.categoryId,
  categoryName: category.name,
  categoryPresetKey: category.presetKey,
};

type Row = Omit<PlannedSummary, "amountCents"> & { amountCents: number };

const toSummary = (row: Row): PlannedSummary => ({
  ...row,
  amountCents: cents(row.amountCents),
});

// The category is joined on both its id and the workspace, so a plan can
// never show another workspace's category name.
const categoryJoin = and(
  eq(category.id, plannedTransaction.categoryId),
  eq(category.workspaceId, plannedTransaction.workspaceId),
);

/**
 * A plan left on "Choose for me" shows the category the rules would give it
 * once confirmed: the saved rules, then the built-in keywords (ADR-103).
 * Nothing is stored, so a new rule changes waiting plans too.
 */
async function withAutomaticCategories(
  workspaceId: string,
  plans: PlannedSummary[],
): Promise<PlannedSummary[]> {
  if (plans.every((plan) => plan.categoryId !== null)) return plans;
  const categories = await listCategories(workspaceId);
  const active = await listActiveRules(workspaceId, undefined, categories);
  const byId = new Map(categories.map((c) => [c.id, c]));
  return plans.map((plan) => {
    if (plan.categoryId !== null) return plan;
    const { categoryId } = classifyStored(
      {
        descriptionRaw: plan.description,
        categoryId: null,
        categoryIsManual: false,
      },
      active,
    );
    const found = categoryId === null ? undefined : byId.get(categoryId);
    return {
      ...plan,
      categoryName: found?.name ?? null,
      categoryPresetKey: found?.presetKey ?? null,
    };
  });
}

/**
 * The workspace's plans dated `from` to `to` ("YYYY-MM-DD", both included),
 * oldest first, for the calendar.
 */
export async function listPlansBetween(
  workspaceId: string,
  from: string,
  to: string,
): Promise<PlannedSummary[]> {
  const rows = await db
    .select(columns)
    .from(plannedTransaction)
    .leftJoin(category, categoryJoin)
    .where(
      and(
        eq(plannedTransaction.workspaceId, workspaceId),
        gte(plannedTransaction.plannedOn, from),
        lte(plannedTransaction.plannedOn, to),
      ),
    )
    .orderBy(
      asc(plannedTransaction.plannedOn),
      asc(plannedTransaction.createdAt),
      asc(plannedTransaction.id),
    );
  return withAutomaticCategories(workspaceId, rows.map(toSummary));
}

export async function getPlan(
  workspaceId: string,
  planId: string,
): Promise<PlannedSummary | null> {
  const [row] = await db
    .select(columns)
    .from(plannedTransaction)
    .leftJoin(category, categoryJoin)
    .where(inWorkspace(workspaceId, planId));
  return row ? toSummary(row) : null;
}

/**
 * Adds a plan to one of the workspace's checking, savings or card accounts.
 * Null when the account is not in this workspace or is a loan, whose rows
 * the calendar leaves out.
 */
export async function createPlan(
  workspaceId: string,
  input: PlanInput,
): Promise<string | null> {
  const [account] = await db
    .select({ type: financialAccount.type })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.workspaceId, workspaceId),
        eq(financialAccount.id, input.accountId),
      ),
    );
  if (!account || account.type === "loan") return null;

  const id = uuidv7();
  await db.insert(plannedTransaction).values({
    id,
    workspaceId,
    financialAccountId: input.accountId,
    plannedOn: input.plannedOn,
    amountCents: input.amountCents,
    description: input.description,
    categoryId: input.categoryId,
  });
  return id;
}

/** Removes a plan. False when it is not in this workspace. */
export async function deletePlan(
  workspaceId: string,
  planId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(plannedTransaction)
    .where(inWorkspace(workspaceId, planId))
    .returning({ id: plannedTransaction.id });
  return deleted.length > 0;
}
