"use server";
import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import {
  parseBudgetAmount,
  targetSchema,
  type FormState,
} from "../domain/forms";
import { canEditMonth, monthSchema, todayInZone } from "../domain/months";
import {
  copyPreviousBudgets,
  removeBudget,
  saveBudget,
  type WriteResult,
} from "./repository";

async function editor(workspaceId: unknown, rawMonth: unknown) {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "editor",
  );
  const month = monthSchema.safeParse(rawMonth);
  if (!month.success) notFound();
  const today = todayInZone(new Date());
  return { workspaceId: access.workspaceId, month: month.data, today };
}
function categoryTarget(month: string, categoryId: unknown) {
  const result = targetSchema.safeParse({ month, categoryId });
  if (!result.success) notFound();
  return result.data.categoryId;
}
const historical = (): FormState => ({
  errors: {
    form: "Past budgets are read-only. Choose this month or next month to change a plan.",
  },
});
async function write(
  workspaceId: string,
  form: FormData,
  operation: () => Promise<{ result: WriteResult; message: string }>,
): Promise<FormState> {
  let outcome: { result: WriteResult; message: string };
  try {
    outcome = await operation();
  } catch {
    console.error("budgets: write failed", { workspaceId });
    const amount = form.get("amount");
    return {
      errors: { form: "Could not save this change. Please try again." },
      ...(typeof amount === "string" ? { amount: amount.slice(0, 100) } : {}),
    };
  }
  if (outcome.result === "not_found") notFound();
  if (outcome.result === "read_only") return historical();
  if (outcome.result === "not_spending")
    return {
      errors: {
        form: "Income and saving categories do not have spending budgets.",
      },
    };
  refresh();
  return { errors: {}, message: outcome.message };
}
export async function saveBudgetAction(
  workspaceId: unknown,
  month: unknown,
  categoryId: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const target = await editor(workspaceId, month);
  const id = categoryTarget(target.month, categoryId);
  if (!canEditMonth(target.month, target.today)) return historical();
  const parsed = parseBudgetAmount(form);
  if (!parsed.ok) return parsed.state;
  return write(target.workspaceId, form, async () => ({
    result: await saveBudget(
      target.workspaceId,
      { month: target.month, categoryId: id, amountCents: parsed.amountCents },
      target.today,
    ),
    message: "Budget saved.",
  }));
}
export async function removeBudgetAction(
  workspaceId: unknown,
  month: unknown,
  categoryId: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const target = await editor(workspaceId, month);
  const id = categoryTarget(target.month, categoryId);
  if (!canEditMonth(target.month, target.today)) return historical();
  return write(target.workspaceId, form, async () => ({
    result: await removeBudget(
      target.workspaceId,
      target.month,
      id,
      target.today,
    ),
    message: "Budget removed. Spending is still recorded.",
  }));
}
export async function copyBudgetsAction(
  workspaceId: unknown,
  month: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const target = await editor(workspaceId, month);
  if (!canEditMonth(target.month, target.today)) return historical();
  return write(target.workspaceId, form, async () => {
    const copied = await copyPreviousBudgets(
      target.workspaceId,
      target.month,
      target.today,
    );
    return {
      result: copied.result,
      message: copied.copied
        ? `Copied ${copied.copied} ${copied.copied === 1 ? "budget" : "budgets"}. Existing allocations were kept.`
        : "No allocations to copy into empty categories. Existing allocations were kept.",
    };
  });
}
