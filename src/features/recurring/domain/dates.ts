import { z } from "zod";

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date in YYYY-MM-DD format.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" &&
      value <= "2199-12-31"
    );
  }, "Enter a real date between 1900 and 2199.");

export const dateNumber = (value: string) =>
  new Date(`${value}T00:00:00Z`).getTime() / 86_400_000;
export const daysBetween = (first: string, second: string) =>
  dateNumber(second) - dateNumber(first);
export function shiftDays(value: string, days: number): string {
  return new Date((dateNumber(value) + days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
export const dayOf = (value: string) => Number(value.slice(8));
export const monthNumber = (value: string) =>
  Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;

/** Preserve the original anchor on February and other shorter months. */
export function shiftMonths(
  value: string,
  months: number,
  anchor = dayOf(value),
): string {
  const index = monthNumber(value) + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchor, last)))
    .toISOString()
    .slice(0, 10);
}

export function nextAfter(
  anchor: string,
  unit: "days" | "months",
  every: number,
  after: string,
): string {
  if (anchor > after) return anchor;
  const count =
    unit === "days"
      ? Math.floor(daysBetween(anchor, after) / every) + 1
      : Math.max(
          1,
          Math.floor((monthNumber(after) - monthNumber(anchor)) / every),
        );
  let next =
    unit === "days"
      ? shiftDays(anchor, count * every)
      : shiftMonths(anchor, count * every);
  if (next <= after)
    next =
      unit === "days"
        ? shiftDays(next, every)
        : shiftMonths(anchor, (count + 1) * every);
  return next;
}

export const cadenceLabel = (unit: "days" | "months", every: number) =>
  unit === "months"
    ? every === 1
      ? "Monthly"
      : every === 3
        ? "Quarterly"
        : every === 12
          ? "Yearly"
          : `Every ${every} months`
    : every === 7
      ? "Weekly"
      : every === 14
        ? "Every two weeks"
        : `Every ${every} days`;

export function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]!
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
}
