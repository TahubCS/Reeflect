import "server-only";
import { formatLong, loadCashflowData, summarize } from "@/features/cashflow";
import { periodEnding, workspaceMeasures } from "@/features/insights";
import { loadWorkspaceData, yesterday } from "@/features/insights/server";
import {
  type CalendarFigures,
  type Facts,
  buildFacts,
} from "../../domain/summary";

/** The same shortest period the Insights page offers, so the two agree. */
const SUMMARY_DAYS = 30;

/**
 * Today's figures from the calendar's own code (ADR-042): the same data and
 * the same `summarize` the dashboard's headline is drawn from.
 */
async function calendarFigures(
  workspaceId: string,
  now: Date,
): Promise<CalendarFigures> {
  const { data, today, suggestions } = await loadCashflowData(workspaceId, now);
  const summary = summarize(data, today);
  return {
    payday: summary.payday && {
      writtenOut: formatLong(summary.payday.date),
      daysAway: summary.payday.daysAway,
    },
    dueTotal: summary.dueTotal,
    dueCount: summary.dueBeforePayday.length,
    freeToSpend: summary.freeToSpend,
    perDay: summary.perDay,
    suggestions,
  };
}

/**
 * What the agent can say about one workspace: balances now, what the
 * calendar says about the days until payday, and the last thirty days
 * worked out by the Insights code (ADR-056). `workspaceId` must come from a
 * verified phone link (ADR-034); nothing here checks a session.
 */
export async function getSummary(
  workspaceId: string,
  now: Date = new Date(),
): Promise<Facts> {
  const period = periodEnding(yesterday(now), SUMMARY_DAYS);
  const [data, calendar] = await Promise.all([
    loadWorkspaceData(workspaceId, period.from),
    calendarFigures(workspaceId, now),
  ]);
  return buildFacts({
    accounts: data.accounts,
    calendar,
    measures: workspaceMeasures(data, period),
    categoryNames: data.names,
  });
}
