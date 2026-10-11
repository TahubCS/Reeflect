// Quiet hours (F-33, ADR-038, ADR-104): a daily range, in the workspace time
// zone, when Reeflect sends no proactive texts. Pure functions; the job that
// sends texts asks `nextAllowedSend` when a message may go.

export const MINUTES_PER_DAY = 24 * 60;

/** Minutes after midnight. The range may cross midnight; start ≠ end. */
export type QuietHours = { startMinute: number; endMinute: number };

/** 9 PM to 9 AM (ADR-038). */
export const DEFAULT_QUIET_HOURS: QuietHours = {
  startMinute: 21 * 60,
  endMinute: 9 * 60,
};

const isMinute = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;

export function isValidQuietHours(hours: QuietHours): boolean {
  return (
    isMinute(hours.startMinute) &&
    isMinute(hours.endMinute) &&
    hours.startMinute !== hours.endMinute
  );
}

/** Whether a minute of the day falls inside quiet hours (start included). */
export function isQuiet(hours: QuietHours, minuteOfDay: number): boolean {
  const { startMinute, endMinute } = hours;
  return startMinute < endMinute
    ? minuteOfDay >= startMinute && minuteOfDay < endMinute
    : minuteOfDay >= startMinute || minuteOfDay < endMinute;
}

/** The wall-clock minute of the day at `instant` in `timeZone`. */
export function minuteOfDayIn(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return part("hour") * 60 + part("minute");
}

/**
 * When a proactive text may be sent: `now` outside quiet hours, otherwise
 * the moment they end, on the wall clock of `timeZone`. Across a daylight
 * saving change the wall clock is checked again, so 9 AM stays 9 AM.
 */
export function nextAllowedSend(
  now: Date,
  hours: QuietHours,
  timeZone: string,
): Date {
  const minute = minuteOfDayIn(now, timeZone);
  if (!isQuiet(hours, minute)) return now;

  // Start of the current minute, then forward to the end of quiet hours.
  const startOfMinute = now.getTime() - (now.getTime() % 60_000);
  const ahead = (hours.endMinute - minute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let candidate = startOfMinute + ahead * 60_000;
  // A clock change in between shifts the wall clock by up to an hour.
  for (let i = 0; i < 2; i += 1) {
    const local = minuteOfDayIn(new Date(candidate), timeZone);
    let drift = (hours.endMinute - local + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (drift > MINUTES_PER_DAY / 2) drift -= MINUTES_PER_DAY;
    if (drift === 0) break;
    candidate += drift * 60_000;
  }
  // An end time the clock skips (2:30 AM on the spring change) does not
  // exist; the result is then an hour after it, still outside quiet hours.
  return new Date(candidate);
}

/** "11:00 PM", "12:00 AM", "7:30 AM". */
export function formatMinute(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "11:00 PM to 7:00 AM". */
export function formatQuietHours(hours: QuietHours): string {
  return `${formatMinute(hours.startMinute)} to ${formatMinute(hours.endMinute)}`;
}

/** "23:00" for an `<input type="time">`. */
export function toTimeInput(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  return `${String(hour).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
}

/** The minute of the day from "HH:MM" (what a time input sends), or null. */
export function fromTimeInput(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
