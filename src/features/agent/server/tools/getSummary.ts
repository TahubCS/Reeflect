import "server-only";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { readBudgetMonth } from "@/features/budgets";
import { formatLong, loadCashflowData, summarize } from "@/features/cashflow";
import { periodEnding, workspaceMeasures } from "@/features/insights";
import { loadWorkspaceData, yesterday } from "@/features/insights/server";
import {
  type CalendarFigures,
  type Facts,
  type FactsInput,
  type MonthFigures,
  buildFacts,
} from "../../domain/summary";

/** The same shortest period the Insights page offers, so the two agree. */
const SUMMARY_DAYS = 30;

/**
 * Today's figures from the calendar's own code (ADR-042): the same data and
 * the same `summarize` the dashboard's headline is drawn from. The accounts
 * come with it, in the stored order, with the names the person gave them.
 */
async function calendarFigures(
  workspaceId: string,
  now: Date,
): Promise<{ calendar: CalendarFigures; accounts: FactsInput["accounts"] }> {
  const { data, today, accounts, suggestions } = await loadCashflowData(
    workspaceId,
    now,
  );
  const summary = summarize(data, today);
  return {
    calendar: {
      payday: summary.payday && {
        writtenOut: formatLong(summary.payday.date),
        daysAway: summary.payday.daysAway,
      },
      dueTotal: summary.dueTotal,
      dueCount: summary.dueBeforePayday.length,
      upcoming: summary.dueBeforePayday.map((item) => ({
        name: item.name,
        writtenOut: formatLong(item.date),
        amount: item.amount,
      })),
      freeToSpend: summary.freeToSpend,
      perDay: summary.perDay,
      suggestions,
    },
    accounts: accounts.map((account) => ({
      type: account.type,
      nickname: account.nickname,
      balance: account.balanceCents,
    })),
  };
}

/**
 * This month so far from the Budgets page's own read (F-28), so a reply and
 * that page cannot disagree. Undefined when it cannot be read: the rest of
 * the answer does not depend on it.
 */
async function monthFigures(
  workspaceId: string,
  now: Date,
): Promise<MonthFigures | undefined> {
  const today = isoDateIn(now, DEFAULT_TIME_ZONE);
  try {
    const month = await readBudgetMonth(workspaceId, today.slice(0, 7), today);
    return {
      totalSpending: month.totals.totalSpending,
      categories: month.rows,
    };
  } catch (error) {
    console.warn("agent: budget month not read", {
      workspaceId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return undefined;
  }
}

/**
 * What the agent can say about one workspace: balances now, what the
 * calendar says about the days until payday, this month's spending and
 * budgets by category, and the last thirty days worked out by the Insights
 * code (ADR-056). `workspaceId` must come from a verified phone link
 * (ADR-034); nothing here checks a session.
 */
export async function getSummary(
  workspaceId: string,
  now: Date = new Date(),
): Promise<Facts> {
  const period = periodEnding(yesterday(now), SUMMARY_DAYS);
  const [data, { calendar, accounts }, month] = await Promise.all([
    loadWorkspaceData(workspaceId, period.from),
    calendarFigures(workspaceId, now),
    monthFigures(workspaceId, now),
  ]);
  return buildFacts({
    accounts,
    calendar,
    month,
    measures: workspaceMeasures(data, period),
    categoryNames: data.names,
  });
}
