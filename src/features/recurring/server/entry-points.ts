import "server-only";
import type { EntryPoint } from "@/lib/auth/entry-point";
import {
  confirmPaymentAction,
  paymentDispositionAction,
  paymentIntentAction,
  refreshPaymentsAction,
  savePaymentAction,
  updatePaymentAction,
} from "./actions";
const empty = { errors: {} };
function validForm(accountId: string) {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    accountId,
    merchant: "Isolation target",
    name: "Isolation payment",
    kind: "bill",
    amountMode: "variable",
    unit: "months",
    every: "1",
    amount: "12.34",
    nextOn: "2026-11-01",
  }))
    form.set(name, value);
  return form;
}
export const RECURRING_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "refreshPaymentsAction",
    minimumRole: "editor",
    call: ({ workspaceId }) =>
      refreshPaymentsAction(workspaceId, empty, new FormData()),
  },
  {
    name: "confirmPaymentAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) =>
      confirmPaymentAction(
        workspaceId,
        accountId,
        "isolation target",
        empty,
        new FormData(),
      ),
  },
  {
    name: "savePaymentAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) =>
      savePaymentAction(workspaceId, empty, validForm(accountId)),
  },
  {
    name: "updatePaymentAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) =>
      updatePaymentAction(
        workspaceId,
        accountId,
        "isolation target",
        empty,
        validForm(accountId),
      ),
  },
  {
    name: "paymentIntentAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) => {
      const form = new FormData();
      form.set("intent", "keep");
      return paymentIntentAction(
        workspaceId,
        accountId,
        "isolation target",
        empty,
        form,
      );
    },
  },
  {
    name: "paymentDispositionAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) => {
      const form = new FormData();
      form.set("disposition", "dismiss");
      return paymentDispositionAction(
        workspaceId,
        accountId,
        "isolation target",
        empty,
        form,
      );
    },
  },
];
