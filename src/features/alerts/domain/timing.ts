import {
  MINUTES_PER_DAY,
  type QuietHours,
  minuteOfDayIn,
  nextAllowedSend,
} from "@/features/messaging/client";

// When a proactive text may go out (ADR-038): outside quiet hours, and no
// more than three a day per person. Pure; the outbox asks before sending.

/** At most this many proactive texts per person per day (ADR-038). */
export const DAILY_CAP = 3;

/** The reminder window before a bill's due date (ADR-030). */
export const REMINDER_DAYS = 7;

/**
 * Moves `candidate` by whole minutes until its wall-clock minute in
 * `timeZone` is `target`. A daylight saving change shifts it by an hour.
 */
function settleOnMinute(candidate: number, target: number, timeZone: string) {
  let at = candidate;
  for (let i = 0; i < 2; i += 1) {
    const local = minuteOfDayIn(new Date(at), timeZone);
    let drift = (target - local + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (drift > MINUTES_PER_DAY / 2) drift -= MINUTES_PER_DAY;
    if (drift === 0) break;
    at += drift * 60_000;
  }
  return at;
}

/** Local midnight at the start of `now`'s day in `timeZone`. */
export function startOfDayIn(now: Date, timeZone: string): Date {
  const startOfMinute = now.getTime() - (now.getTime() % 60_000);
  const minute = minuteOfDayIn(now, timeZone);
  return new Date(settleOnMinute(startOfMinute - minute * 60_000, 0, timeZone));
}

/** Local midnight at the start of the next day in `timeZone`. */
export function startOfNextDayIn(now: Date, timeZone: string): Date {
  const startOfMinute = now.getTime() - (now.getTime() % 60_000);
  const minute = minuteOfDayIn(now, timeZone);
  return new Date(
    settleOnMinute(
      startOfMinute + (MINUTES_PER_DAY - minute) * 60_000,
      0,
      timeZone,
    ),
  );
}

/**
 * When a waiting text may be sent: `now` itself when that is allowed,
 * otherwise the end of quiet hours, or, once three have gone out today,
 * the first allowed moment tomorrow.
 */
export function sendTime(
  now: Date,
  hours: QuietHours,
  sentToday: number,
  timeZone: string,
): Date {
  if (sentToday >= DAILY_CAP) {
    return nextAllowedSend(startOfNextDayIn(now, timeZone), hours, timeZone);
  }
  return nextAllowedSend(now, hours, timeZone);
}

/** Whole days from `today` to `on`, both "YYYY-MM-DD". */
export function daysBetween(today: string, on: string): number {
  const utc = (iso: string) =>
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
    );
  return Math.round((utc(on) - utc(today)) / 86_400_000);
}

/** Whether a bill due `on` is inside the reminder window from `today`. */
export function inReminderWindow(today: string, on: string): boolean {
  const days = daysBetween(today, on);
  return days >= 0 && days <= REMINDER_DAYS;
}
