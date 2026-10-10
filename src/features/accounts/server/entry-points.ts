import "server-only";
import type { EntryPoint } from "@/lib/auth/entry-point";
import {
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from "./actions";

function validForm(): FormData {
  const form = new FormData();
  form.set("type", "checking");
  form.set("institutionName", "Isolation Bank");
  form.set("nickname", "Isolation check");
  form.set("maskLast4", "0000");
  form.set("balance", "1");
  return form;
}

const EMPTY = { errors: {} };

/** Every F-03 server action, for the isolation matrix (TEST-06). */
export const ACCOUNT_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "createAccountAction",
    minimumRole: "editor",
    call: ({ workspaceId }) =>
      createAccountAction(workspaceId, EMPTY, validForm()),
  },
  {
    name: "updateAccountAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) =>
      updateAccountAction(workspaceId, accountId, EMPTY, validForm()),
  },
  {
    name: "deleteAccountAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) =>
      deleteAccountAction(workspaceId, accountId),
  },
];
