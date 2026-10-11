import { z } from "zod";
import { DEFAULT_TIME_ZONE } from "@/config/app";

export const FIRST_MONTH = "2000-01";
export const monthSchema = z
  .string()
  .regex(
    /^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/,
    "Choose a real month between 2000 and 2199.",
  );

/** Read only after authorization, so the default never becomes a build-time date. */
export function todayInZone(now: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, number! - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

export function monthTitle(month: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function monthWindow(month: string, today: string) {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year!, number!, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: last < today ? last : today };
}

export function canEditMonth(month: string, today: string): boolean {
  const current = today.slice(0, 7);
  return month === current || month === shiftMonth(current, 1);
}

export function requestedMonth(raw: unknown, today: string): string | null {
  const parsed = monthSchema.safeParse(raw ?? today.slice(0, 7));
  return parsed.success && parsed.data <= shiftMonth(today.slice(0, 7), 1)
    ? parsed.data
    : null;
}
