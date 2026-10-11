"use server";

import { notFound, redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import {
  categoryNameSchema,
  formValues,
  objectIdSchema,
  overrideFormInput,
  overrideInputSchema,
  rejectedForm,
  ruleFormInput,
  ruleInputSchema,
  type FormState,
} from "../domain/forms";
import {
  createRule,
  deleteRule,
  renameCategory,
  saveOverride,
  updateRule,
  type WriteResult,
} from "./repository";

async function editorAccess(workspaceId: unknown): Promise<string> {
  return (
    await requireWorkspaceAccess(await getSession(), workspaceId, "editor")
  ).workspaceId;
}

function objectId(value: unknown): string {
  const parsed = objectIdSchema.safeParse(value);
  if (!parsed.success) notFound();
  return parsed.data;
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
    // Neither raw database errors nor transaction descriptions reach logs/UI.
    console.error("categorization: write failed", { workspaceId });
    return {
      errors: { form: "Could not save your changes. Please try again." },
      values: formValues(form),
    };
  }
  if (result === "not_found") notFound();
  if (result === "rule_limit")
    return {
      errors: {
        form: "This workspace has 1,000 rules. Delete a rule before adding another.",
      },
      values: formValues(form),
    };
  if (result === "duplicate_name")
    return {
      errors: { name: "A category already has this name." },
      values: formValues(form),
    };
  redirect(`/w/${workspaceId}/transactions`);
}

export async function saveOverrideAction(
  workspaceId: unknown,
  transactionId: unknown,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editorAccess(workspaceId);
  const id = objectId(transactionId);
  const parsed = overrideInputSchema.safeParse(overrideFormInput(form));
  if (!parsed.success) return rejectedForm(parsed.error, form);
  return write(verified, form, () => saveOverride(verified, id, parsed.data));
}

export async function createRuleAction(
  workspaceId: unknown,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editorAccess(workspaceId);
  const parsed = ruleInputSchema.safeParse(ruleFormInput(form));
  if (!parsed.success) return rejectedForm(parsed.error, form);
  return write(verified, form, () => createRule(verified, parsed.data));
}

export async function updateRuleAction(
  workspaceId: unknown,
  ruleId: unknown,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editorAccess(workspaceId);
  const id = objectId(ruleId);
  const parsed = ruleInputSchema.safeParse(ruleFormInput(form));
  if (!parsed.success) return rejectedForm(parsed.error, form);
  return write(verified, form, () => updateRule(verified, id, parsed.data));
}

export async function deleteRuleAction(
  workspaceId: unknown,
  ruleId: unknown,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editorAccess(workspaceId);
  const id = objectId(ruleId);
  return write(verified, form, () => deleteRule(verified, id));
}

export async function renameCategoryAction(
  workspaceId: unknown,
  categoryId: unknown,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const verified = await editorAccess(workspaceId);
  const id = objectId(categoryId);
  const parsed = categoryNameSchema.safeParse(form.get("name"));
  if (!parsed.success) {
    return {
      errors: { name: parsed.error.issues[0]!.message },
      values: {
        name:
          typeof form.get("name") === "string"
            ? (form.get("name") as string).slice(0, 60)
            : "",
      },
    };
  }
  return write(verified, form, () => renameCategory(verified, id, parsed.data));
}
