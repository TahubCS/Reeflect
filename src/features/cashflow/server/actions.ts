"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { listCategories, saveOverride } from "@/features/categorization";
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

// The day panel's two writes (F-12, F-13), in ARCH-04 order: session, then
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

// The same words whether the account is missing or in another workspace.
const NO_SUCH_ACCOUNT = "Choose one of your accounts.";
const NO_SUCH_CATEGORY = "Choose one of your categories.";

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
    today: isoDateIn(new Date(), DEFAULT_TIME_ZONE),
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
  if (
    categoryId !== null &&
    !(await listCategories(verified)).some((c) => c.id === categoryId)
  ) {
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
