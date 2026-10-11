import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysBetween,
  daysInMonth,
  formatLong,
  formatShort,
  monthChipLabel,
  monthName,
  monthOf,
  monthPrefix,
  monthRange,
  monthTitle,
  monthsApart,
  ordinal,
  parseIso,
  toIso,
  weekdayOf,
} from "./dates";

describe("ISO dates", () => {
  it("builds and reads a zero-padded date", () => {
    expect(toIso(2026, 3, 7)).toBe("2026-03-07");
    expect(parseIso("2026-03-07")).toEqual({ year: 2026, month: 3, day: 7 });
  });

  it("gives the month of a date and its prefix", () => {
    expect(monthOf("2026-10-07")).toEqual({ year: 2026, month: 10 });
    expect(monthPrefix({ year: 2026, month: 3 })).toBe("2026-03");
  });
});

describe("month lengths", () => {
  it("knows February in leap and non-leap years", () => {
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
  });

  it("knows 30- and 31-day months", () => {
    expect(daysInMonth({ year: 2026, month: 4 })).toBe(30);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
  });
});

describe("weekdays and distances", () => {
  it("numbers weekdays from Sunday", () => {
    expect(weekdayOf("2026-10-04")).toBe(0);
    expect(weekdayOf("2026-10-07")).toBe(3);
  });

  it("counts days between dates, across a month end and backwards", () => {
    expect(daysBetween("2026-10-07", "2026-10-15")).toBe(8);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-10-15", "2026-10-07")).toBe(-8);
  });
});

describe("month arithmetic", () => {
  it("moves forward across a year end", () => {
    expect(addMonths({ year: 2026, month: 11 }, 2)).toEqual({
      year: 2027,
      month: 1,
    });
  });

  it("moves backward across a year start", () => {
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("counts months apart in both directions", () => {
    const october = { year: 2026, month: 10 };

    expect(monthsApart(october, { year: 2027, month: 1 })).toBe(3);
    expect(monthsApart(october, { year: 2026, month: 8 })).toBe(-2);
    expect(monthsApart(october, october)).toBe(0);
  });
});

describe("labels", () => {
  it("names months", () => {
    expect(monthName({ year: 2026, month: 10 })).toBe("October");
    expect(monthTitle({ year: 2026, month: 10 })).toBe("October 2026");
  });

  it("formats long and short dates", () => {
    expect(formatLong("2026-10-07")).toBe("Wednesday, October 7");
    expect(formatShort("2026-10-07")).toBe("Oct 7");
  });

  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [10, "10th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [30, "30th"],
    [31, "31st"],
  ])("writes %i as %s", (day, expected) => {
    expect(ordinal(day)).toBe(expected);
  });
});

describe("month chips", () => {
  const october = { year: 2026, month: 10 };

  it("lists every month in a range, across a year end", () => {
    expect(
      monthRange({ year: 2026, month: 11 }, { year: 2027, month: 2 }),
    ).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
  });

  it("gives one month for a range that starts and ends together", () => {
    expect(monthRange(october, october)).toEqual([october]);
  });

  it("gives no months when the range ends before it starts", () => {
    expect(monthRange(october, { year: 2026, month: 9 })).toEqual([]);
  });

  it("names a month short, adding the year only when it differs", () => {
    expect(monthChipLabel({ year: 2026, month: 5 }, october)).toBe("May");
    expect(monthChipLabel({ year: 2027, month: 1 }, october)).toBe("Jan 2027");
    expect(monthChipLabel({ year: 2025, month: 12 }, october)).toBe("Dec 2025");
  });
});
