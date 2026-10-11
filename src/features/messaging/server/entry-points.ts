import "server-only";
import type { EntryPoint } from "@/lib/auth/entry-point";
import {
  approveLinkAction,
  createLinkCodeAction,
  disconnectAction,
  rejectLinkAction,
  setAlertTypesAction,
  setProactiveOptInAction,
  setQuietHoursAction,
} from "./actions";

/** Every F-24, F-33 and F-22/F-26 server action, for the isolation matrix (TEST-06). */
export const MESSAGING_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "createLinkCodeAction",
    minimumRole: "owner",
    call: ({ workspaceId }) => createLinkCodeAction(workspaceId),
  },
  {
    name: "approveLinkAction",
    minimumRole: "owner",
    call: ({ workspaceId }) => approveLinkAction(workspaceId),
  },
  {
    name: "rejectLinkAction",
    minimumRole: "owner",
    call: ({ workspaceId }) => rejectLinkAction(workspaceId),
  },
  {
    name: "disconnectAction",
    minimumRole: "owner",
    call: ({ workspaceId }) => disconnectAction(workspaceId),
  },
  {
    name: "setProactiveOptInAction",
    minimumRole: "owner",
    call: ({ workspaceId }) => setProactiveOptInAction(workspaceId, true),
  },
  {
    name: "setQuietHoursAction",
    minimumRole: "owner",
    call: ({ workspaceId }) =>
      setQuietHoursAction(workspaceId, "23:00", "07:00"),
  },
  {
    name: "setAlertTypesAction",
    minimumRole: "owner",
    call: ({ workspaceId }) =>
      setAlertTypesAction(workspaceId, {
        subscriptionAlerts: false,
        billReminders: true,
      }),
  },
];
