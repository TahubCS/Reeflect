"use server";
import { notFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import {
  dispositionSchema,
  formValues,
  intentSchema,
  parsePaymentForm,
  rejectedForm,
  targetSchema,
  type FormState,
} from "../domain/forms";
import {
  confirmPattern,
  listRecurringPayments,
  refreshRecurringSeries,
  savePayment,
  setPaymentDisposition,
  setPaymentIntent,
  type WriteResult,
} from "./repository";

async function access(workspaceId: unknown) {
  return (
    await requireWorkspaceAccess(await getSession(), workspaceId, "editor")
  ).workspaceId;
}
function target(accountId: unknown, merchant: unknown) {
  const result = targetSchema.safeParse({ accountId, merchant });
  if (!result.success) notFound();
  return result.data;
}
async function write(
  workspaceId: string,
  form: FormData,
  operation: () => Promise<WriteResult>,
): Promise<FormState> {
  let result: WriteResult;
  try {
    result = await operation();
  } catch {
    console.error("recurring: write failed", { workspaceId });
    return {
      errors: { form: "Could not save this change. Please try again." },
      values: formValues(form),
    };
  }
  if (result === "not_found") notFound();
  if (result !== "ok")
    return {
      errors: {
        form:
          result === "limit"
            ? "This workspace has 1,000 saved recurring payments."
            : result === "duplicate"
              ? "This account already tracks that payee. Edit the existing payment."
              : "Cancellation choices apply to subscriptions. Change the kind first if needed.",
      },
      values: formValues(form),
    };
  redirect(`/w/${workspaceId}/subscriptions`);
}
export async function refreshPaymentsAction(
  workspaceId: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await access(workspaceId);
  return write(verified, form, () => refreshRecurringSeries(verified));
}
export async function confirmPaymentAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await access(workspaceId);
  const input = target(accountId, merchant);
  return write(verified, form, () =>
    confirmPattern(verified, input.accountId, input.merchant),
  );
}
export async function savePaymentAction(
  workspaceId: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await access(workspaceId);
  const input = parsePaymentForm(form);
  if (!input.success) return rejectedForm(input.error, form);
  return write(verified, form, () => savePayment(verified, input.data));
}
export async function updatePaymentAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await access(workspaceId);
  const original = target(accountId, merchant);
  const bound = new FormData();
  for (const [key, value] of form) bound.append(key, value);
  bound.set("accountId", original.accountId);
  bound.set("merchant", original.merchant);
  const input = parsePaymentForm(bound);
  if (!input.success) return rejectedForm(input.error, bound);
  return write(verified, bound, () => savePayment(verified, input.data, true));
}
export async function paymentIntentAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await access(workspaceId);
  const input = target(accountId, merchant);
  const intent = intentSchema.safeParse(form.get("intent"));
  if (!intent.success) return rejectedForm(intent.error, form);
  return write(verified, form, () =>
    setPaymentIntent(verified, input.accountId, input.merchant, intent.data),
  );
}
export async function paymentDispositionAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await access(workspaceId);
  const input = target(accountId, merchant);
  const disposition = dispositionSchema.safeParse(form.get("disposition"));
  if (!disposition.success) return rejectedForm(disposition.error, form);
  return write(verified, form, () =>
    setPaymentDisposition(
      verified,
      input.accountId,
      input.merchant,
      disposition.data,
    ),
  );
}

/**
 * How many suggested patterns wait for a yes or no: the count on the
 * header's Recurring payments link. Any member may read it. The header asks
 * on every page, including one the visitor may not open, so a refusal is no
 * number (0) instead of a not-found page.
 */
export async function suggestionCountAction(
  workspaceId: unknown,
): Promise<number> {
  let verified: string;
  try {
    verified = (
      await requireWorkspaceAccess(await getSession(), workspaceId, "viewer")
    ).workspaceId;
  } catch {
    return 0;
  }
  return (await listRecurringPayments(verified)).summary.candidates;
}
