import "server-only";
import type { EntryPoint } from "@/lib/auth/entry-point";
import { writeSummaryAction } from "./actions";
import { loadSummaryPanel } from "./summary";

/** Every F-15 entry point, for the isolation matrix (TEST-06). */
export const SUMMARY_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "loadSummaryPanel",
    minimumRole: "viewer",
    call: ({ workspaceId }) => loadSummaryPanel(workspaceId),
  },
  {
    name: "writeSummaryAction",
    minimumRole: "viewer",
    call: ({ workspaceId }) => writeSummaryAction(workspaceId),
  },
];
