import "server-only";
import type { EntryPoint } from "@/lib/auth/entry-point";
import { getInsights } from "./insights";

export const INSIGHTS_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "getInsights",
    minimumRole: "viewer",
    call: (target) => getInsights(target.workspaceId, { period: "30" }),
  },
];
