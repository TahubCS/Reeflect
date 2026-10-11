"use server";

import { notFound, redirect } from "next/navigation";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import {
  TRANSACTION_FORM_FIELDS,
  type TransactionFieldErrors,
  type TransactionFormField,
  type TransactionFormState,
  parseTransactionForm,
  transactionIdSchema,
} from "../domain/transaction-input";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from "./repository";

// Server actions for F-04, in ARCH-04 order: session, then workspace access
// at the required role, then validated input, then the repository with the
// verified workspace id. Ids bound by the page come back from the browser,
// so they are validated here like any other input.

// The same words whether the account is missing or in another workspace, so
// the answer says nothing about other workspaces.
const NO_SUCH_ACCOUNT = "Choose one of your accounts.";

function rejected(
  errors: TransactionFieldErrors,
  formData: FormData,
): TransactionFormState {
  // Only the form's own field names are copied, never names chosen by the
  // request, so a field like `__proto__` cannot reach the object.
  const values: Partial<Record<TransactionFormField, string>> = {};
  for (const name of TRANSACTION_FORM_FIELDS) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value.slice(0, 200);
  }
  return { errors, values };
}

async function editorAccess(workspaceId: unknown): Promise<string> {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "editor",
  );
  return access.workspaceId;
}

function parseTransactionId(transactionId: unknown): string {
  const parsed = transactionIdSchema.safeParse(transactionId);
  if (!parsed.success) notFound();
  return parsed.data;
}

const today = () => isoDateIn(new Date(), DEFAULT_TIME_ZONE);

const listHref = (workspaceId: string) => `/w/${workspaceId}/transactions`;

export async function createTransactionAction(
  workspaceId: unknown,
  _previous: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const verified = await editorAccess(workspaceId);
  const parsed = parseTransactionForm(Object.fromEntries(formData), {
    today: today(),
    ledgerEditable: true,
  });
  if (!parsed.ok) return rejected(parsed.errors, formData);
  const { ledger } = parsed.value;
  if (!ledger) return rejected({ accountId: NO_SUCH_ACCOUNT }, formData);

  const id = await createTransaction(verified, { ...parsed.value, ledger });
  if (id === null) return rejected({ accountId: NO_SUCH_ACCOUNT }, formData);
  redirect(listHref(verified));
}

export async function updateTransactionAction(
  workspaceId: unknown,
  transactionId: unknown,
  _previous: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const verified = await editorAccess(workspaceId);
  const id = parseTransactionId(transactionId);
  const existing = await getTransaction(verified, id);
  if (!existing) notFound();

  const parsed = parseTransactionForm(Object.fromEntries(formData), {
    today: today(),
    ledgerEditable: existing.editableInFull && existing.transferPairId === null,
  });
  if (!parsed.ok) return rejected(parsed.errors, formData);

  const result = await updateTransaction(verified, id, parsed.value);
  if (result === "not found") notFound();
  if (result === "no such account") {
    return rejected({ accountId: NO_SUCH_ACCOUNT }, formData);
  }
  if (result === "paired")
    return rejected(
      {
        transfer:
          "Remove pairing in Review transfers before changing its financial fields or transfer label.",
      },
      formData,
    );
  if (result === "payment evidence")
    return rejected(
      {
        transfer:
          "This transaction is linked to a bill. Unlink its payment evidence in Bills before changing its transfer label.",
      },
      formData,
    );
  redirect(listHref(verified));
}

export async function deleteTransactionAction(
  workspaceId: unknown,
  transactionId: unknown,
): Promise<void> {
  const verified = await editorAccess(workspaceId);
  const id = parseTransactionId(transactionId);

  if (!(await deleteTransaction(verified, id))) notFound();
  redirect(listHref(verified));
}
