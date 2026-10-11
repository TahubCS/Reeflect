"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { accountIdSchema } from "@/features/accounts";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import { statementStore } from "@/lib/storage";
import type { CommitFormState, PreviewFormState } from "../domain/preview";
import {
  FILE_PROBLEM_TEXT,
  MAX_CSV_BYTES,
  MAX_PDF_BYTES,
  statementFormat,
} from "../domain/validate-file";
import { commitStatement, discardPreview, previewStatement } from "./pipeline";

// Server actions for F-05 and F-06, in ARCH-04 order: session, then workspace access
// at the editor role, then validated input, then the pipeline with the
// verified workspace id. Ids bound by the page come back from the browser,
// so they are validated here like any other input.

const batchIdSchema = z.uuid();

const NOT_SET_UP =
  "Statement import isn't set up on this server yet: object storage is not configured.";

async function editorAccess(workspaceId: unknown) {
  const session = await getSession();
  const access = await requireWorkspaceAccess(session, workspaceId, "editor");
  return { workspaceId: access.workspaceId, userId: session!.user.id };
}

export async function previewImportAction(
  workspaceId: unknown,
  _previous: PreviewFormState,
  formData: FormData,
): Promise<PreviewFormState> {
  const verified = await editorAccess(workspaceId);
  const account = accountIdSchema.safeParse(formData.get("accountId"));
  if (!account.success) return { problem: "Choose one of your accounts." };
  const accountId = account.data;
  const file = formData.get("statement");
  if (!(file instanceof File) || file.size === 0) {
    return { problem: FILE_PROBLEM_TEXT.missing, accountId };
  }
  // Refuse an oversized file before reading it. The name and type only
  // pick the limit here; the pipeline decides the format from the bytes.
  const named = statementFormat(new Uint8Array(), file.name, file.type);
  if (named === "csv" && file.size > MAX_CSV_BYTES)
    return { problem: FILE_PROBLEM_TEXT["csv-too-large"], accountId };
  if (file.size > MAX_PDF_BYTES)
    return { problem: FILE_PROBLEM_TEXT["too-large"], accountId };
  const store = statementStore();
  if (!store) return { problem: NOT_SET_UP, accountId };

  const outcome = await previewStatement({
    workspaceId: verified.workspaceId,
    accountId,
    userId: verified.userId,
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name,
    contentType: file.type,
    store,
  });
  if (outcome.kind === "problem")
    return { problem: outcome.message, accountId };
  if (outcome.kind === "blocked") {
    return {
      blocked: { summary: outcome.summary, checks: outcome.checks },
      accountId,
    };
  }
  redirect(`/w/${verified.workspaceId}/import?batch=${outcome.batchId}`);
}

export async function commitImportAction(
  workspaceId: unknown,
  batchId: unknown,
  _previous: CommitFormState,
  formData: FormData,
): Promise<CommitFormState> {
  const verified = await editorAccess(workspaceId);
  const batch = batchIdSchema.safeParse(batchId);
  if (!batch.success) notFound();
  const store = statementStore();
  if (!store) return { problem: NOT_SET_UP };

  const outcome = await commitStatement({
    workspaceId: verified.workspaceId,
    batchId: batch.data,
    confirmIdentity: formData.get("confirmIdentity") === "yes",
    store,
  });
  if (outcome.kind === "problem") return { problem: outcome.message };
  redirect(
    `/w/${verified.workspaceId}/transactions?account=${outcome.accountId}`,
  );
}

export async function discardImportAction(
  workspaceId: unknown,
  batchId: unknown,
): Promise<void> {
  const verified = await editorAccess(workspaceId);
  const batch = batchIdSchema.safeParse(batchId);
  if (!batch.success) notFound();
  const store = statementStore();
  if (!store) notFound();

  if (!(await discardPreview(verified.workspaceId, batch.data, store)))
    notFound();
  redirect(`/w/${verified.workspaceId}/import`);
}
