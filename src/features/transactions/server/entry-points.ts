import "server-only";
import type { EntryPoint } from "@/lib/auth/entry-point";
import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
} from "./actions";

function validForm(accountId: string): FormData {
  const form = new FormData();
  form.set("accountId", accountId);
  form.set("postedOn", "2026-01-15");
  form.set("direction", "out");
  form.set("amount", "1");
  form.set("description", "Isolation check");
  return form;
}

const EMPTY = { errors: {} };

/** Every F-04 server action, for the isolation matrix (TEST-06). */
export const TRANSACTION_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "createTransactionAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) =>
      createTransactionAction(workspaceId, EMPTY, validForm(accountId)),
  },
  {
    name: "updateTransactionAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId, transactionId }) =>
      updateTransactionAction(
        workspaceId,
        transactionId,
        EMPTY,
        validForm(accountId),
      ),
  },
  {
    name: "deleteTransactionAction",
    minimumRole: "editor",
    call: ({ workspaceId, transactionId }) =>
      deleteTransactionAction(workspaceId, transactionId),
  },
];
