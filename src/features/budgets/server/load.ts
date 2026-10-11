import "server-only";
import { notFound } from "next/navigation";
import { ensureCategories } from "@/features/categorization";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { roleAtLeast } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { canEditMonth, requestedMonth, todayInZone } from "../domain/months";
import { readBudgetMonth } from "./repository";

/** Public authorized web read boundary. Service tools use their own identity boundary. */
export async function loadBudgets(
  workspaceId: unknown,
  rawMonth?: unknown,
  now?: Date,
) {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const today = todayInZone(now ?? new Date());
  const month = requestedMonth(rawMonth, today);
  if (month === null) notFound();
  const isEditor = roleAtLeast(access.role, "editor");
  if (isEditor) await ensureCategories(access.workspaceId);
  const data = await readBudgetMonth(access.workspaceId, month, today);
  return {
    ...data,
    workspaceId: access.workspaceId,
    month,
    today,
    canEdit: isEditor && canEditMonth(month, today),
    isEditor,
  };
}
export type BudgetsView = Awaited<ReturnType<typeof loadBudgets>>;
