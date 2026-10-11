import "server-only";
import { readFileSync } from "node:fs";
import type { EntryPoint } from "@/lib/auth/entry-point";
import {
  commitPdfImportAction,
  discardImportAction,
  previewPdfImportAction,
} from "./actions";

const STATEMENT = new URL(
  "../../../../tests/fixtures/pdf/capital-one-normal.pdf",
  import.meta.url,
);

function previewForm(accountId: string): FormData {
  const form = new FormData();
  form.set("accountId", accountId);
  form.set(
    "statement",
    new File([readFileSync(STATEMENT)], "statement.pdf", {
      type: "application/pdf",
    }),
  );
  return form;
}

function confirmForm(): FormData {
  const form = new FormData();
  form.set("confirmIdentity", "yes");
  return form;
}

/** Every F-06 server action, for the isolation matrix (TEST-06). */
export const IMPORT_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "previewPdfImportAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) =>
      previewPdfImportAction(workspaceId, {}, previewForm(accountId)),
  },
  {
    name: "commitPdfImportAction",
    minimumRole: "editor",
    call: ({ workspaceId, importBatchId }) =>
      commitPdfImportAction(workspaceId, importBatchId, {}, confirmForm()),
  },
  {
    name: "discardImportAction",
    minimumRole: "editor",
    call: ({ workspaceId, importBatchId }) =>
      discardImportAction(workspaceId, importBatchId),
  },
];
