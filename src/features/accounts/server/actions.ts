"use server";

import { notFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import {
  ACCOUNT_FORM_FIELDS,
  type AccountFieldErrors,
  type AccountFormField,
  type AccountFormState,
  accountIdSchema,
  parseAccountForm,
} from "../domain/account-input";
import {
  createAccount,
  deleteAccount,
  getAccount,
  updateAccount,
} from "./repository";

// Server actions for F-03, in ARCH-04 order: session, then workspace access
// at the required role, then validated input, then the repository with the
// verified workspace id. Ids bound by the page come back from the browser,
// so they are validated here like any other input.

function rejected(
  errors: AccountFieldErrors,
  formData: FormData,
): AccountFormState {
  // Only the form's own field names are copied, never names chosen by the
  // request, so a field like `__proto__` cannot reach the object.
  const values: Partial<Record<AccountFormField, string>> = {};
  for (const name of ACCOUNT_FORM_FIELDS) {
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

function parseAccountId(accountId: unknown): string {
  const parsed = accountIdSchema.safeParse(accountId);
  if (!parsed.success) notFound();
  return parsed.data;
}

export async function createAccountAction(
  workspaceId: unknown,
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const verified = await editorAccess(workspaceId);
  const parsed = parseAccountForm(Object.fromEntries(formData), {
    balanceEditable: true,
  });
  if (!parsed.ok) return rejected(parsed.errors, formData);

  await createAccount(verified, parsed.value);
  redirect(`/w/${verified}/accounts`);
}

export async function updateAccountAction(
  workspaceId: unknown,
  accountId: unknown,
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const verified = await editorAccess(workspaceId);
  const id = parseAccountId(accountId);
  const existing = await getAccount(verified, id);
  if (!existing) notFound();

  const parsed = parseAccountForm(Object.fromEntries(formData), {
    balanceEditable: existing.balanceEditable,
  });
  if (!parsed.ok) return rejected(parsed.errors, formData);

  if (!(await updateAccount(verified, id, parsed.value))) notFound();
  redirect(`/w/${verified}/accounts`);
}

export async function deleteAccountAction(
  workspaceId: unknown,
  accountId: unknown,
): Promise<void> {
  const verified = await editorAccess(workspaceId);
  const id = parseAccountId(accountId);

  if (!(await deleteAccount(verified, id))) notFound();
  redirect(`/w/${verified}/accounts`);
}
