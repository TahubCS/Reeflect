import "server-only";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { shiftDays } from "@/features/recurring/client";
import type { EntryPoint } from "@/lib/auth/entry-point";
import {
  addDayEntryAction,
  addPlanAction,
  confirmPlanAction,
  removeDayEntryAction,
  removePlanAction,
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
    name: "addPlanAction",
    minimumRole: "editor",
    call: ({ workspaceId, accountId, categoryId }) =>
      addPlanAction(workspaceId, {
        accountId,
        // A valid day: after today and inside the calendar.
        plannedOn: shiftDays(isoDateIn(new Date(), DEFAULT_TIME_ZONE), 3),
        direction: "out",
        amount: "1",
        description: "Isolation check",
        categoryId,
      }),
  },
  {
    name: "removePlanAction",
    minimumRole: "editor",
    call: ({ workspaceId, planId }) => removePlanAction(workspaceId, planId),
  },
  {
    name: "confirmPlanAction",
    minimumRole: "editor",
    call: ({ workspaceId, planId }) => confirmPlanAction(workspaceId, planId),
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
