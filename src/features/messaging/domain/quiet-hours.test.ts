import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUIET_HOURS,
  formatMinute,
  formatQuietHours,
  fromTimeInput,
  isQuiet,
  isValidQuietHours,
  minuteOfDayIn,
  nextAllowedSend,
  toTimeInput,
} from "./quiet-hours";

const NY = "America/New_York";
const at = (hour: number, minute = 0) => hour * 60 + minute;

describe("isValidQuietHours", () => {
  it("accepts any two different minutes of the day", () => {
    expect(isValidQuietHours(DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isValidQuietHours({ startMinute: 0, endMinute: 1439 })).toBe(true);
  });

  it("refuses equal times, out-of-range and fractional minutes", () => {
    expect(isValidQuietHours({ startMinute: 60, endMinute: 60 })).toBe(false);
    expect(isValidQuietHours({ startMinute: -1, endMinute: 60 })).toBe(false);
    expect(isValidQuietHours({ startMinute: 60, endMinute: 1440 })).toBe(false);
    expect(isValidQuietHours({ startMinute: 60.5, endMinute: 0 })).toBe(false);
  });
});

describe("isQuiet", () => {
  it("handles a range that crosses midnight", () => {
    const hours = { startMinute: at(23), endMinute: at(7) };
    expect(isQuiet(hours, at(23))).toBe(true);
    expect(isQuiet(hours, at(0))).toBe(true);
    expect(isQuiet(hours, at(6, 59))).toBe(true);
    expect(isQuiet(hours, at(7))).toBe(false);
    expect(isQuiet(hours, at(22, 59))).toBe(false);
  });

  it("handles a range inside one day", () => {
    const hours = { startMinute: at(13), endMinute: at(14) };
    expect(isQuiet(hours, at(13))).toBe(true);
    expect(isQuiet(hours, at(14))).toBe(false);
    expect(isQuiet(hours, at(12, 59))).toBe(false);
  });
});

describe("minuteOfDayIn", () => {
  it("reads the wall clock in the time zone", () => {
    // 03:30 UTC is 11:30 PM the evening before in New York (EDT).
    expect(minuteOfDayIn(new Date("2026-10-11T03:30:00Z"), NY)).toBe(
      at(23, 30),
    );
    expect(minuteOfDayIn(new Date("2026-10-11T04:00:00Z"), NY)).toBe(0);
  });
});

describe("nextAllowedSend", () => {
  it("returns now outside quiet hours", () => {
    const now = new Date("2026-10-11T16:00:00Z"); // noon EDT
    expect(nextAllowedSend(now, DEFAULT_QUIET_HOURS, NY)).toBe(now);
  });

  it("waits until quiet hours end, the same night or the next morning", () => {
    // 10:15:30 PM EDT → 9:00 AM EDT the next day.
    expect(
      nextAllowedSend(
        new Date("2026-10-12T02:15:30Z"),
        DEFAULT_QUIET_HOURS,
        NY,
      ).toISOString(),
    ).toBe("2026-10-12T13:00:00.000Z");
    // 3 AM EDT → 9 AM EDT the same day.
    expect(
      nextAllowedSend(
        new Date("2026-10-11T07:00:00Z"),
        DEFAULT_QUIET_HOURS,
        NY,
      ).toISOString(),
    ).toBe("2026-10-11T13:00:00.000Z");
  });

  it("keeps 9 AM on the wall clock across the autumn change", () => {
    // 10 PM EDT on Oct 31; clocks go back at 2 AM on Nov 1.
    expect(
      nextAllowedSend(
        new Date("2026-11-01T02:00:00Z"),
        DEFAULT_QUIET_HOURS,
        NY,
      ).toISOString(),
    ).toBe("2026-11-01T14:00:00.000Z"); // 9 AM EST
  });

  it("keeps 9 AM on the wall clock across the spring change", () => {
    // 10 PM EST on Mar 7; clocks go forward at 2 AM on Mar 8.
    expect(
      nextAllowedSend(
        new Date("2026-03-08T03:00:00Z"),
        DEFAULT_QUIET_HOURS,
        NY,
      ).toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z"); // 9 AM EDT
  });

  it("ends outside quiet hours when the end time is skipped", () => {
    const hours = { startMinute: at(23), endMinute: at(2, 30) };
    const sent = nextAllowedSend(new Date("2026-03-08T06:00:00Z"), hours, NY);
    expect(isQuiet(hours, minuteOfDayIn(sent, NY))).toBe(false);
    expect(sent.getTime()).toBeGreaterThan(Date.parse("2026-03-08T06:00:00Z"));
  });
});

describe("formatting", () => {
  it("writes 12-hour times", () => {
    expect(formatMinute(0)).toBe("12:00 AM");
    expect(formatMinute(at(12))).toBe("12:00 PM");
    expect(formatMinute(at(7, 5))).toBe("7:05 AM");
    expect(formatMinute(at(23, 30))).toBe("11:30 PM");
    expect(formatQuietHours({ startMinute: at(23), endMinute: at(7) })).toBe(
      "11:00 PM to 7:00 AM",
    );
  });

  it("round-trips time-input values", () => {
    expect(toTimeInput(at(7, 5))).toBe("07:05");
    expect(fromTimeInput("23:00")).toBe(at(23));
    expect(fromTimeInput("00:00")).toBe(0);
    for (const bad of ["24:00", "7:00", "12:60", "", "11pm"]) {
      expect(fromTimeInput(bad)).toBeNull();
    }
  });
});
