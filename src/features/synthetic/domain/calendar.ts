// Calendar dates as plain `YYYY-MM-DD` strings, with no time zone: a
// transaction's posting date is a day, not an instant.

export type IsoDate = string;
/** `YYYY-MM`. */
export type YearMonth = string;

const DAY_MS = 86_400_000;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function toUtc(date: IsoDate): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
}

function fromUtc(ms: number): IsoDate {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** True for a `YYYY-MM-DD` string that names a day that exists. */
export function isRealDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && fromUtc(toUtc(date)) === date;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: IsoDate): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** The month `offset` months after `start` (offset may be 0). */
export function monthAt(start: YearMonth, offset: number): YearMonth {
  const index =
    Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1 + offset;
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`;
}

export function daysInMonth(month: YearMonth): number {
  return new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
}

/** That day of the month; days past the month's end fall on its last day. */
export function dateIn(month: YearMonth, day: number): IsoDate {
  return `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
}

export function firstDay(month: YearMonth): IsoDate {
  return `${month}-01`;
}

export function lastDay(month: YearMonth): IsoDate {
  return dateIn(month, 31);
}

/** Saturday and Sunday move back to the Friday before; weekdays stay. */
export function previousBusinessDay(date: IsoDate): IsoDate {
  const weekday = weekdayOf(date);
  if (weekday === 6) return addDays(date, -1);
  if (weekday === 0) return addDays(date, -2);
  return date;
}

/** Every date in the month that falls on `weekday`. */
export function weekdaysIn(month: YearMonth, weekday: number): IsoDate[] {
  const first = firstDay(month);
  const offset = (weekday - weekdayOf(first) + 7) % 7;
  const dates: IsoDate[] = [];
  for (let day = 1 + offset; day <= daysInMonth(month); day += 7) {
    dates.push(dateIn(month, day));
  }
  return dates;
}

/** Dates in the month that are a whole number of `step` days from `anchor`. */
export function everyNDaysIn(
  month: YearMonth,
  anchor: IsoDate,
  step: number,
): IsoDate[] {
  const first = firstDay(month);
  const behind = daysBetween(anchor, first);
  let date = addDays(anchor, Math.ceil(behind / step) * step);
  const dates: IsoDate[] = [];
  while (date.startsWith(month)) {
    dates.push(date);
    date = addDays(date, step);
  }
  return dates;
}
