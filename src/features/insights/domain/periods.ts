// The three comparison periods (ADR-055): the last 30, 90 and 365 days
// before a date, and how a period's totals become "per month".
import { z } from "zod";
import { type Cents, fraction } from "@/lib/money";

/** `YYYY-MM-DD`. */
export type IsoDate = string;

export const PERIOD_DAYS = [30, 90, 365] as const;
export type PeriodDays = (typeof PERIOD_DAYS)[number];

export const PERIOD_LABELS: Record<PeriodDays, string> = {
  30: "Last 30 days",
  90: "Last 3 months",
  365: "Last year",
};

export const DEFAULT_PERIOD: PeriodDays = 90;

/** A `?period=` value; anything else is the default. */
export const periodSchema = z.coerce
  .number()
  .pipe(z.union(PERIOD_DAYS.map((days) => z.literal(days))))
  .catch(DEFAULT_PERIOD);

/** Both ends included. */
export type Period = { days: PeriodDays; from: IsoDate; to: IsoDate };

const DAY_MS = 86_400_000;
const toMs = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`);
const fromMs = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromMs(toMs(date) + days * DAY_MS);
}

/** Days from `from` to `to`, counting both. */
export function daysIncluding(from: IsoDate, to: IsoDate): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS) + 1;
}

/** The `days` days that end on `to`. */
export function periodEnding(to: IsoDate, days: PeriodDays): Period {
  return { days, from: addDays(to, 1 - days), to };
}

/**
 * The part of the period the data covers: from the later of the period's
 * start and the first day there is data. Zero days when the data starts
 * after the period ends.
 */
export function coveredDays(period: Period, dataFrom: IsoDate | null): number {
  if (dataFrom === null || dataFrom > period.to) return 0;
  const from = dataFrom > period.from ? dataFrom : period.from;
  return daysIncluding(from, period.to);
}

/** A total over `days` days as an average month (30.4375 days, 365.25 ÷ 12). */
export function perMonth(total: Cents, days: number): Cents {
  return fraction(total, 304_375, days * 10_000);
}

/** The same, for counts that are not money (no-spend days). */
export function countPerMonth(count: number, days: number): number {
  return Math.round((count * 30.4375) / days);
}

/** The UTC calendar day before `now`: your period ends yesterday (ADR-055). */
export function yesterday(now: Date): IsoDate {
  return addDays(now.toISOString().slice(0, 10), -1);
}
