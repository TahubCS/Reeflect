import "server-only";
import { periodEnding, workspaceMeasures } from "@/features/insights";
import { loadWorkspaceData, yesterday } from "@/features/insights/server";
import { type Facts, buildFacts } from "../../domain/summary";

/** The same shortest period the Insights page offers, so the two agree. */
const SUMMARY_DAYS = 30;

/**
 * What the agent can say about one workspace: balances now, and the last
 * thirty days worked out by the Insights code (ADR-056). `workspaceId` must
 * come from a verified phone link (ADR-034); nothing here checks a session.
 */
export async function getSummary(
  workspaceId: string,
  now: Date = new Date(),
): Promise<Facts> {
  const period = periodEnding(yesterday(now), SUMMARY_DAYS);
  const data = await loadWorkspaceData(workspaceId, period.from);
  return buildFacts({
    accounts: data.accounts,
    measures: workspaceMeasures(data, period),
    categoryNames: data.names,
  });
}
