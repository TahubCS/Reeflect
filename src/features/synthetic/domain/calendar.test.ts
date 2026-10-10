import { describe, expect, it } from "vitest";
import {
  addDays,
  dateIn,
  daysBetween,
  daysInMonth,
  everyNDaysIn,
  firstDay,
  isRealDate,
  lastDay,
  monthAt,
  previousBusinessDay,
  weekdayOf,
  weekdaysIn,
} from "./calendar";

describe("isRealDate", () => {
  it.each(["2026-10-10", "2028-02-29", "2026-12-31"])("accepts %s", (d) => {
    expect(isRealDate(d)).toBe(true);
  });

  it.each(["2026-02-29", "2026-13-01", "2026-04-31", "07/12/2026", "2026-7-1"])(
    "rejects %s",
    (d) => {
      expect(isRealDate(d)).toBe(false);
    },
  );
});

describe("day arithmetic", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days between dates, negative when going back", () => {
    expect(daysBetween("2026-07-03", "2026-07-17")).toBe(14);
    expect(daysBetween("2026-07-17", "2026-07-03")).toBe(-14);
  });

  it("knows the weekday (0 = Sunday)", () => {
    expect(weekdayOf("2026-10-10")).toBe(6);
    expect(weekdayOf("2026-10-11")).toBe(0);
    expect(weekdayOf("2026-07-01")).toBe(3);
  });
});

describe("months", () => {
  it("steps across a year end", () => {
    expect(monthAt("2026-11", 0)).toBe("2026-11");
    expect(monthAt("2026-11", 3)).toBe("2027-02");
  });

  it("knows month lengths, including leap years", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-09")).toBe(30);
  });

  it("puts days past the month's end on its last day (ADR-030)", () => {
    expect(dateIn("2026-09", 31)).toBe("2026-09-30");
    expect(dateIn("2026-02", 30)).toBe("2026-02-28");
    expect(dateIn("2026-07", 4)).toBe("2026-07-04");
    expect(firstDay("2026-07")).toBe("2026-07-01");
    expect(lastDay("2028-02")).toBe("2028-02-29");
  });
});

describe("previousBusinessDay", () => {
  it("moves Saturday and Sunday back to Friday", () => {
    expect(previousBusinessDay("2026-08-15")).toBe("2026-08-14");
    expect(previousBusinessDay("2026-08-16")).toBe("2026-08-14");
  });

  it("leaves weekdays alone", () => {
    expect(previousBusinessDay("2026-08-14")).toBe("2026-08-14");
  });
});

describe("weekdaysIn", () => {
  it("lists every Wednesday of the month", () => {
    expect(weekdaysIn("2026-07", 3)).toEqual([
      "2026-07-01",
      "2026-07-08",
      "2026-07-15",
      "2026-07-22",
      "2026-07-29",
    ]);
  });

  it("handles a weekday earlier in the week than the 1st", () => {
    // August 2026 starts on a Saturday; its first Wednesday is the 5th.
    expect(weekdaysIn("2026-08", 3)[0]).toBe("2026-08-05");
  });
});

describe("everyNDaysIn", () => {
  it("continues a biweekly series from an anchor before the month", () => {
    expect(everyNDaysIn("2026-08", "2026-07-03", 14)).toEqual([
      "2026-08-14",
      "2026-08-28",
    ]);
  });

  it("runs the series backwards from an anchor after the month", () => {
    expect(everyNDaysIn("2026-07", "2026-08-14", 14)).toEqual([
      "2026-07-03",
      "2026-07-17",
      "2026-07-31",
    ]);
  });
});
