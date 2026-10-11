import "server-only";
import type { EntryPoint } from "@/lib/auth/entry-point";
import {
  addDayEntryAction,
  removeDayEntryAction,
  setSubscriptionIntentAction,
} from "./actions";
import { loadDashboard } from "./load";

/** Every F-12 entry point, for the isolation matrix (TEST-06). */
export const CASHFLOW_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "loadDashboard",
    minimumRole: "viewer",
    call: ({ workspaceId }) => loadDashboard(workspaceId),
  },
  {
    name: "addDayEntryAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId, categoryId }) =>
      addDayEntryAction(workspaceId, {
        accountId,
        postedOn: "2026-01-15",
        direction: "out",
        amount: "1",
        description: "Isolation check",
        categoryId,
      }),
  },
  {
    name: "removeDayEntryAction",
    minimumRole: "editor",
    call: ({ workspaceId, transactionId }) =>
      removeDayEntryAction(workspaceId, transactionId),
  },
  {
    name: "setSubscriptionIntentAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId }) =>
      setSubscriptionIntentAction(workspaceId, {
        accountId,
        merchant: "isolation target",
        intent: "cancel",
      }),
  },
];
