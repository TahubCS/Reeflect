"use server";
import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { confirmPattern, setPaymentDisposition } from "@/features/recurring";
import { dateSchema } from "@/features/recurring/client";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import {
  billHref,
  formValues,
  parseBillForm,
  parseInvoiceForm,
  paymentInputSchemaForBills,
  rejected,
  revisionSchema,
  targetSchema,
  type FormState,
} from "../domain/forms";
import {
  linkBillPayment,
  markBillPaid,
  saveBill,
  saveInvoice,
  unlinkBillPayment,
  type Target,
  type WriteResult,
} from "./repository";

async function editor(workspaceId: unknown) {
  return (
    await requireWorkspaceAccess(await getSession(), workspaceId, "editor")
  ).workspaceId;
}
function target(accountId: unknown, merchant: unknown): Target {
  const result = targetSchema.safeParse({ accountId, merchant });
  if (!result.success) notFound();
  return result.data;
}
function cycleTarget(on: unknown, revision: unknown) {
  const parsed = z
    .object({ on: dateSchema, revision: revisionSchema })
    .safeParse({ on, revision });
  if (!parsed.success) notFound();
  return parsed.data;
}
const messages: Record<Exclude<WriteResult, "ok" | "not_found">, string> = {
  duplicate:
    "This account already tracks that payee. Open the existing bill or restore it.",
  stale:
    "This bill changed since you opened it. Reload the page and review the latest values before saving.",
  invalid_payment:
    "Choose a posted payment for this bill's account, payee and cycle. Pending payments and refunds cannot settle an invoice.",
  allocated:
    "This transaction is already linked to an invoice. Unlink it before assigning it to another cycle.",
  invalid_account:
    "Use a checking, savings or card payment account. Debt payments require checking or savings and an owned card or loan account.",
  limit:
    "The workspace's bill history or recurring-payment limit has been reached. No partial change was saved.",
};
async function write(
  workspaceId: string,
  form: FormData,
  operation: () => Promise<WriteResult>,
  message: string,
): Promise<FormState> {
  let result: WriteResult;
  try {
    result = await operation();
  } catch {
    console.error("bills: write failed", { workspaceId });
    return {
      errors: { form: "Could not save this change. Please try again." },
      values: formValues(form),
    };
  }
  if (result === "not_found") notFound();
  if (result !== "ok")
    return { errors: { form: messages[result] }, values: formValues(form) };
  refresh();
  return { errors: {}, message };
}

export async function createBillAction(
  workspaceId: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editor(workspaceId);
  const parsed = parseBillForm(form);
  if (!parsed.success) return rejected(parsed.error, form);
  const state = await write(
    verified,
    form,
    () => saveBill(verified, parsed.data),
    "Bill added.",
  );
  if (!Object.keys(state.errors).length)
    redirect(
      billHref(
        verified,
        parsed.data.accountId,
        parsed.data.merchant,
        parsed.data.nextOn,
      ),
    );
  return state;
}
export async function updateBillAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  revision: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editor(workspaceId);
  const bound = target(accountId, merchant);
  const version = revisionSchema.safeParse(revision);
  if (!version.success) notFound();
  const input = new FormData();
  for (const [key, value] of form) input.append(key, value);
  input.set("accountId", bound.accountId);
  input.set("merchant", bound.merchant);
  const parsed = parseBillForm(input);
  if (!parsed.success) return rejected(parsed.error, input);
  return write(
    verified,
    input,
    () => saveBill(verified, parsed.data, version.data),
    "Bill settings saved.",
  );
}
export async function saveInvoiceAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  on: unknown,
  revision: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editor(workspaceId);
  const bound = target(accountId, merchant);
  const cycle = cycleTarget(on, revision);
  const parsed = parseInvoiceForm(form);
  if (!parsed.success) return rejected(parsed.error, form);
  return write(
    verified,
    form,
    () => saveInvoice(verified, bound, cycle.on, cycle.revision, parsed.data),
    "Invoice saved.",
  );
}
export async function markPaidAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  on: unknown,
  revision: unknown,
  value: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editor(workspaceId);
  const bound = target(accountId, merchant);
  const cycle = cycleTarget(on, revision);
  const parsed = z.boolean().safeParse(value);
  if (!parsed.success) notFound();
  return write(
    verified,
    form,
    () => markBillPaid(verified, bound, cycle.on, cycle.revision, parsed.data),
    parsed.data
      ? "Marked paid manually. No transaction was created."
      : "Manual payment mark removed.",
  );
}
export async function linkPaymentAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  on: unknown,
  revision: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editor(workspaceId);
  const bound = target(accountId, merchant);
  const cycle = cycleTarget(on, revision);
  const parsed = paymentInputSchemaForBills.safeParse(formValues(form));
  if (!parsed.success) return rejected(parsed.error, form);
  return write(
    verified,
    form,
    () =>
      linkBillPayment(
        verified,
        bound,
        cycle.on,
        cycle.revision,
        parsed.data.transactionId,
      ),
    "Payment linked.",
  );
}
export async function unlinkPaymentAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  on: unknown,
  revision: unknown,
  paymentId: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editor(workspaceId);
  const bound = target(accountId, merchant);
  const cycle = cycleTarget(on, revision);
  const parsed = z.uuid().safeParse(paymentId);
  if (!parsed.success) notFound();
  return write(
    verified,
    form,
    () =>
      unlinkBillPayment(verified, bound, cycle.on, cycle.revision, parsed.data),
    "Payment unlinked. Recorded account activity is unchanged.",
  );
}
export async function confirmBillAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editor(workspaceId);
  const bound = target(accountId, merchant);
  return write(
    verified,
    form,
    async () => {
      const result = await confirmPattern(
        verified,
        bound.accountId,
        bound.merchant,
        new Date(),
        "bill",
      );
      return result === "not_subscription" ? "not_found" : result;
    },
    "Bill pattern confirmed.",
  );
}
export async function billDispositionAction(
  workspaceId: unknown,
  accountId: unknown,
  merchant: unknown,
  disposition: unknown,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editor(workspaceId);
  const bound = target(accountId, merchant);
  const parsed = z
    .enum(["remove", "restore", "dismiss"])
    .safeParse(disposition);
  if (!parsed.success) notFound();
  return write(
    verified,
    form,
    async () => {
      const result = await setPaymentDisposition(
        verified,
        bound.accountId,
        bound.merchant,
        parsed.data,
        new Date(),
        "bill",
      );
      return result === "not_subscription" ? "not_found" : result;
    },
    parsed.data === "restore"
      ? "Tracking restored. Detected patterns may need confirmation."
      : "Tracking stopped. Invoice history and account activity were kept.",
  );
}
