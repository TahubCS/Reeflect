"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { listCategories, saveOverride } from "@/features/categorization";
import {
  createPlan,
  deletePlan,
  getPlan,
  parsePlanForm,
  planIdSchema,
} from "@/features/plans";
import { setPaymentIntent } from "@/features/recurring";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  parseTransactionForm,
  transactionIdSchema,
} from "@/features/transactions";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import { dashboardWindow } from "../domain/from-records";

// The day panel's writes (F-12, F-13, F-37), in ARCH-04 order: session, then
// workspace access, then validated input, then the transactions feature's
// repository with the verified workspace id. They refresh the page in place
// instead of redirecting, so the calendar keeps its month and selected day.

export type DayEntryResult = { ok: true } | { ok: false; message: string };

const dayEntrySchema = z.object({
  accountId: z.string().max(64),
  postedOn: z.string().max(10),
  direction: z.enum(["out", "in"]),
  amount: z.string().max(32),
  description: z.string().max(200),
  /** Null lets the saved rules choose (ADR-013). */
  categoryId: z.uuid().nullable(),
});

export type DayEntryInput = z.infer<typeof dayEntrySchema>;

const planEntrySchema = dayEntrySchema
  .omit({ postedOn: true })
  .extend({ plannedOn: z.string().max(10) });

// The same words whether the account is missing or in another workspace.
const NO_SUCH_ACCOUNT = "Choose one of your accounts.";
const NO_SUCH_CATEGORY = "Choose one of your categories.";

const today = () => isoDateIn(new Date(), DEFAULT_TIME_ZONE);

async function hasCategory(workspaceId: string, categoryId: string | null) {
  return (
    categoryId === null ||
    (await listCategories(workspaceId)).some((c) => c.id === categoryId)
  );
}

async function editorAccess(workspaceId: unknown): Promise<string> {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "editor",
  );
  return access.workspaceId;
}

/** Adds a transaction typed in the day panel, on today or an earlier day. */
export async function addDayEntryAction(
  workspaceId: unknown,
  input: unknown,
): Promise<DayEntryResult> {
  const verified = await editorAccess(workspaceId);
  const read = dayEntrySchema.safeParse(input);
  if (!read.success)
    return { ok: false, message: "Check the form and try again." };

  const parsed = parseTransactionForm(read.data, {
    today: today(),
    ledgerEditable: true,
  });
  if (!parsed.ok) {
    const { amount, description, accountId, postedOn, direction } =
      parsed.errors;
    return {
      ok: false,
      message:
        amount ??
        description ??
        accountId ??
        postedOn ??
        direction ??
        "Check the form and try again.",
    };
  }
  const { ledger } = parsed.value;
  if (!ledger) return { ok: false, message: NO_SUCH_ACCOUNT };

  const { categoryId } = read.data;
  if (!(await hasCategory(verified, categoryId))) {
    return { ok: false, message: NO_SUCH_CATEGORY };
  }

  const id = await createTransaction(verified, { ...parsed.value, ledger });
  if (id === null) return { ok: false, message: NO_SUCH_ACCOUNT };
  if (categoryId !== null) {
    await saveOverride(verified, id, { mode: "manual", categoryId });
  }
  refresh();
  return { ok: true };
}

/**
 * Removes a transaction typed by hand. Imported and synced rows are removed
 * on the Transactions page, where the person sees what re-importing means.
 */
export async function removeDayEntryAction(
  workspaceId: unknown,
  transactionId: unknown,
): Promise<void> {
  const verified = await editorAccess(workspaceId);
  const id = transactionIdSchema.safeParse(transactionId);
  if (!id.success) notFound();

  const existing = await getTransaction(verified, id.data);
  if (!existing?.editableInFull) notFound();
  if (!(await deleteTransaction(verified, id.data))) notFound();
  refresh();
}

/**
 * Plans money for a later day the calendar shows (F-37, ADR-102). A plan is
 * not a transaction: it moves no account balance until it is confirmed.
 */
export async function addPlanAction(
  workspaceId: unknown,
  input: unknown,
): Promise<DayEntryResult> {
  const verified = await editorAccess(workspaceId);
  const read = planEntrySchema.safeParse(input);
  if (!read.success)
    return { ok: false, message: "Check the form and try again." };

  const now = today();
  const parsed = parsePlanForm(read.data, {
    today: now,
    lastDay: dashboardWindow(now).to,
  });
  if (!parsed.ok) {
    const { amount, description, accountId, plannedOn, direction } =
      parsed.errors;
    return {
      ok: false,
      message:
        amount ??
        description ??
        accountId ??
        plannedOn ??
        direction ??
        "Check the form and try again.",
    };
  }
  if (!(await hasCategory(verified, parsed.value.categoryId))) {
    return { ok: false, message: NO_SUCH_CATEGORY };
  }

  const id = await createPlan(verified, parsed.value);
  if (id === null) return { ok: false, message: NO_SUCH_ACCOUNT };
  refresh();
  return { ok: true };
}

/** Removes a plan, whether its day has come or not. */
export async function removePlanAction(
  workspaceId: unknown,
  planId: unknown,
): Promise<void> {
  const verified = await editorAccess(workspaceId);
  const id = planIdSchema.safeParse(planId);
  if (!id.success) notFound();
  if (!(await deletePlan(verified, id.data))) notFound();
  refresh();
}

/**
 * "It happened": turns a plan whose day has come into a manual transaction
 * on that day (ADR-050), with the plan's category, then removes the plan.
 * The transaction takes the plan's id, so a second click or a retry after a
 * failure adds nothing twice (ADR-102).
 */
export async function confirmPlanAction(
  workspaceId: unknown,
  planId: unknown,
): Promise<DayEntryResult> {
  const verified = await editorAccess(workspaceId);
  const id = planIdSchema.safeParse(planId);
  if (!id.success) notFound();

  const plan = await getPlan(verified, id.data);
  if (!plan) notFound();
  if (plan.plannedOn > today()) {
    return { ok: false, message: "You can confirm it on or after its day." };
  }

  const transactionId = await createTransaction(verified, {
    id: plan.id,
    description: plan.description,
    isTransfer: false,
    ledger: {
      accountId: plan.accountId,
      postedOn: plan.plannedOn,
      amountCents: plan.amountCents,
      status: "posted",
    },
  });
  if (transactionId === null) return { ok: false, message: NO_SUCH_ACCOUNT };
  if (plan.categoryId !== null) {
    await saveOverride(verified, transactionId, {
      mode: "manual",
      categoryId: plan.categoryId,
    });
  }
  await deletePlan(verified, plan.id);
  refresh();
  return { ok: true };
}

const intentInputSchema = z.object({
  accountId: z.uuid(),
  merchant: z.string().trim().min(1).max(500),
  intent: z.enum(["none", "keep", "cancel"]),
});

/**
 * Saves keep / planning to cancel on a confirmed subscription, the same
 * choice the Recurring payments page shows (ADR-058). It only records the
 * plan: nothing is cancelled with the provider.
 */
export async function setSubscriptionIntentAction(
  workspaceId: unknown,
  input: unknown,
): Promise<DayEntryResult> {
  const verified = await editorAccess(workspaceId);
  const read = intentInputSchema.safeParse(input);
  if (!read.success) notFound();

  const { accountId, merchant, intent } = read.data;
  const result = await setPaymentIntent(verified, accountId, merchant, intent);
  if (result === "not_found") notFound();
  if (result !== "ok")
    return { ok: false, message: "Only subscriptions can be marked." };
  refresh();
  return { ok: true };
}
