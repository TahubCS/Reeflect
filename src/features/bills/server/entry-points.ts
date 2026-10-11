import "server-only";
import type { EntryPoint, EntryPointTarget } from "@/lib/auth/entry-point";
import { loadBills } from "./load";
import {
  billDispositionAction,
  confirmBillAction,
  createBillAction,
  linkPaymentAction,
  markPaidAction,
  saveInvoiceAction,
  unlinkPaymentAction,
  updateBillAction,
} from "./actions";
const empty = { errors: {} };
const on = "2026-01-10";
const merchant = "isolation target";
function form(accountId: string) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    accountId,
    merchant,
    name: "Isolation target",
    amount: "5",
    amountMode: "variable",
    every: "1",
    unit: "months",
    nextOn: on,
    invoiceAmount: "5",
    dueOn: on,
  }))
    data.set(key, value);
  return data;
}
const bound = (t: EntryPointTarget) =>
  [t.workspaceId, t.accountId, merchant] as const;
export const BILL_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "loadBills",
    minimumRole: "viewer",
    call: ({ workspaceId }) => loadBills(workspaceId),
  },
  {
    name: "loadBillDetail",
    minimumRole: "viewer",
    call: ({ workspaceId, accountId }) =>
      loadBills(workspaceId, { accountId, merchant, cycle: on }),
  },
  {
    name: "createBillAction",
    minimumRole: "editor",
    call: (t) => createBillAction(t.workspaceId, empty, form(t.accountId)),
  },
  {
    name: "updateBillAction",
    minimumRole: "editor",
    call: (t) => updateBillAction(...bound(t), 1, empty, form(t.accountId)),
  },
  {
    name: "saveInvoiceAction",
    minimumRole: "editor",
    call: (t) =>
      saveInvoiceAction(...bound(t), on, 1, empty, form(t.accountId)),
  },
  {
    name: "markPaidAction",
    minimumRole: "editor",
    call: (t) =>
      markPaidAction(...bound(t), on, 1, true, empty, new FormData()),
  },
  {
    name: "linkPaymentAction",
    minimumRole: "editor",
    call: (t) => {
      const data = form(t.accountId);
      data.set("transactionId", t.transactionId);
      data.set("confirmed", "on");
      return linkPaymentAction(...bound(t), on, 1, empty, data);
    },
  },
  {
    name: "unlinkPaymentAction",
    minimumRole: "editor",
    call: (t) =>
      unlinkPaymentAction(
        ...bound(t),
        on,
        1,
        t.transactionId,
        empty,
        new FormData(),
      ),
  },
  {
    name: "confirmBillAction",
    minimumRole: "editor",
    call: (t) => confirmBillAction(...bound(t), empty, new FormData()),
  },
  {
    name: "billDispositionAction",
    minimumRole: "editor",
    call: (t) =>
      billDispositionAction(...bound(t), "remove", empty, new FormData()),
  },
];
