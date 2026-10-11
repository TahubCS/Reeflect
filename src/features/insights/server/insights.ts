import "server-only";
import { z } from "zod";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import { type Cents, ZERO, cents } from "@/lib/money";
import {
  COMPARE_WITH,
  type CategoryRow,
  type Comparison,
  type GroupSummary,
  METRICS,
  categoryRows,
  compareMetric,
  peopleLikeYou,
  summarizeGroup,
} from "../domain/cohort";
import { type StoredMeasures, toStored } from "../domain/metrics";
import {
  type IsoDate,
  type Period,
  periodEnding,
  periodSchema,
  yesterday,
} from "../domain/periods";
import { workspaceMeasures } from "../domain/workspace";
import {
  listSamplePeople,
  loadWorkspaceData,
  newestSampleBatch,
} from "./repository";

export const SHOW_AS = ["dollars", "share"] as const;
export type ShowAs = (typeof SHOW_AS)[number];

const querySchema = z.object({
  period: periodSchema,
  compare: z.enum(COMPARE_WITH).catch("like_you"),
  show: z.enum(SHOW_AS).catch("dollars"),
});
export type InsightsQuery = z.infer<typeof querySchema>;

export type InsightsView = {
  query: InsightsQuery;
  /** Your period: the days ending yesterday. */
  period: Period;
  you: {
    measures: StoredMeasures;
    /** Days of the period your data covers; under `period.days` is noted. */
    coveredDays: number;
    uncategorized: Cents;
  } | null;
  sample: {
    label: string;
    /** The group's period ends on the batch's as-of date. */
    asOf: IsoDate;
    group: GroupSummary;
    /** True when "people like you" had to be everyone (no take-home yet). */
    everyoneInstead: boolean;
    categories: CategoryRow[];
    comparisons: Comparison[];
  } | null;
};

/**
 * Everything the Insights page shows (F-35, ADR-055). Your figures come
 * from this workspace only; the group's from stored sample figures.
 */
export async function getInsights(
  workspaceId: string,
  rawQuery: Record<string, unknown>,
  now?: Date,
): Promise<InsightsView> {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const query = querySchema.parse(rawQuery);
  // Read the clock only after the session: the page is per request, never
  // prerendered with a stale date.
  const period = periodEnding(yesterday(now ?? new Date()), query.period);

  const [data, batch] = await Promise.all([
    loadWorkspaceData(access.workspaceId, period.from),
    newestSampleBatch(),
  ]);
  const measured = workspaceMeasures(data, period);
  const you = measured && {
    measures: toStored(measured),
    coveredDays: measured.coveredDays,
    uncategorized: measured.byCategory.uncategorized ?? ZERO,
  };
  if (!batch) return { query, period, you, sample: null };

  const everyone = await listSamplePeople(batch.id, query.period);
  const takeHome = cents(you?.measures.take_home ?? 0);
  const everyoneInstead = query.compare === "like_you" && takeHome <= 0;
  const group =
    query.compare === "everyone" || everyoneInstead
      ? everyone
      : peopleLikeYou(everyone, takeHome);
  const mine = you?.measures ?? {};
  return {
    query,
    period,
    you,
    sample: {
      label: batch.label,
      asOf: batch.asOf,
      group: summarizeGroup(group),
      everyoneInstead,
      categories: categoryRows(mine, group, data.names),
      comparisons: METRICS.map((m) => compareMetric(m, mine, group)).filter(
        (c): c is Comparison => c !== null,
      ),
    },
  };
}
