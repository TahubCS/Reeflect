// The charges behind a recurring payment, oldest first, with the days
// between each one and the one before. Pure and client-safe: the card shows
// the rhythm, and a gap well away from the usual one is called out in words.
import { daysBetween, median } from "./dates";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export type ChargeStep<T> = T & {
  /** Days since the charge before; null for the first one found. */
  gapDays: number | null;
  /** True when the gap is well away from the usual one. */
  offPattern: boolean;
};

export type Evidence<T> = {
  /** Oldest first. */
  steps: ChargeStep<T>[];
  /** The middle gap, rounded; null with fewer than two charges. */
  usualGap: number | null;
};

/**
 * How far a gap may stray from the usual one and still fit: months run 28
 * to 31 days, so a monthly charge allows a few days either way.
 */
export const gapTolerance = (usualGap: number) =>
  Math.max(3, Math.round(usualGap * 0.15));

export function chargeEvidence<T extends { postedOn: string }>(
  charges: readonly T[],
): Evidence<T> {
  const ordered = [...charges].sort((a, b) =>
    a.postedOn.localeCompare(b.postedOn),
  );
  const gaps = ordered.map((charge, index) =>
    index === 0
      ? null
      : daysBetween(ordered[index - 1]!.postedOn, charge.postedOn),
  );
  const known = gaps.filter((gap): gap is number => gap !== null);
  const usualGap = known.length ? Math.round(median(known)) : null;
  return {
    usualGap,
    steps: ordered.map((charge, index) => {
      const gapDays = gaps[index]!;
      return {
        ...charge,
        gapDays,
        offPattern:
          gapDays !== null &&
          usualGap !== null &&
          Math.abs(gapDays - usualGap) > gapTolerance(usualGap),
      };
    }),
  };
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** One line under the button, e.g. "Every 30–31 days, no breaks". */
export function describeEvidence<T>(evidence: Evidence<T>): string {
  const { steps } = evidence;
  if (steps.length === 0) return "No charges found yet";
  if (steps.length === 1) return "One charge so far";
  const fitting = steps
    .filter((step) => step.gapDays !== null && !step.offPattern)
    .map((step) => step.gapDays!);
  const off = steps.filter((step) => step.offPattern);
  const low = Math.min(...fitting);
  const high = Math.max(...fitting);
  const rhythm =
    fitting.length === 0
      ? `About ${days(evidence.usualGap!)} apart`
      : low === high
        ? `Every ${days(low)}`
        : `Every ${low}–${high} days`;
  if (off.length === 0) return `${rhythm}, no breaks`;
  const gapList = off.map((step) => days(step.gapDays!)).join(", ");
  return `${rhythm}; ${off.length === 1 ? "1 gap" : `${off.length} gaps`} of ${gapList}`;
}

/** "Oct 9" */
export function shortDate(iso: string) {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

/** "Oct 9, 2026" */
export function longDate(iso: string) {
  return `${shortDate(iso)}, ${iso.slice(0, 4)}`;
}

/** The small text under a charge in the list. */
export function gapNote(step: { gapDays: number | null; offPattern: boolean }) {
  if (step.gapDays === null) return "First one found";
  return `${days(step.gapDays)} after the one before${step.offPattern ? ", off the usual rhythm" : ""}`;
}
