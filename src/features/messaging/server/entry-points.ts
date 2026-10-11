import "server-only";
import type { EntryPoint } from "@/lib/auth/entry-point";
import {
  approveLinkAction,
  createLinkCodeAction,
  disconnectAction,
  rejectLinkAction,
  setProactiveOptInAction,
  setQuietHoursAction,
} from "./actions";

/** Every F-24 and F-33 server action, for the isolation matrix (TEST-06). */
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
];
