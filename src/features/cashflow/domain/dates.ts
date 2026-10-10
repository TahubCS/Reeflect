// Calendar dates as plain "YYYY-MM-DD" strings, so time zones never shift a day.

export type IsoDate = string;
/** month is 1 to 12 */
export type YearMonth = { year: number; month: number };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const pad = (n: number) => String(n).padStart(2, "0");

export const toIso = (year: number, month: number, day: number): IsoDate =>
  `${year}-${pad(month)}-${pad(day)}`;

export function parseIso(iso: IsoDate) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export const monthOf = (iso: IsoDate): YearMonth => {
  const { year, month } = parseIso(iso);
  return { year, month };
};

export const monthPrefix = ({ year, month }: YearMonth) =>
  `${year}-${pad(month)}`;

export const daysInMonth = ({ year, month }: YearMonth) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const utc = (iso: IsoDate) => {
  const { year, month, day } = parseIso(iso);
  return Date.UTC(year, month - 1, day);
};

/** 0 is Sunday */
export const weekdayOf = (iso: IsoDate) => new Date(utc(iso)).getUTCDay();

export const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round((utc(to) - utc(from)) / 86_400_000);

export function addMonths(
  { year, month }: YearMonth,
  count: number,
): YearMonth {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export const monthsApart = (from: YearMonth, to: YearMonth) =>
  to.year * 12 + to.month - (from.year * 12 + from.month);

export const monthName = ({ month }: YearMonth) => MONTHS[month - 1];

export const monthTitle = (ym: YearMonth) => `${monthName(ym)} ${ym.year}`;

/** "Wednesday, October 7" */
export function formatLong(iso: IsoDate) {
  const { month, day } = parseIso(iso);
  return `${WEEKDAYS[weekdayOf(iso)]}, ${MONTHS[month - 1]} ${day}`;
}

/** "Oct 7" */
export function formatShort(iso: IsoDate) {
  const { month, day } = parseIso(iso);
  return `${MONTHS[month - 1].slice(0, 3)} ${day}`;
}

/** "7th" */
export function ordinal(day: number) {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
}
