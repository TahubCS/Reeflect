import { describe, expect, it } from "vitest";
import {
  DAILY_CAP,
  daysBetween,
  inReminderWindow,
  sendTime,
  startOfDayIn,
  startOfNextDayIn,
} from "./timing";

const ZONE = "America/New_York";
const DEFAULT = { startMinute: 21 * 60, endMinute: 9 * 60 };

describe("sendTime", () => {
  it("sends now outside quiet hours and under the cap", () => {
    const now = new Date("2026-10-11T16:00:00Z"); // noon EDT
    expect(sendTime(now, DEFAULT, 0, ZONE)).toEqual(now);
    expect(sendTime(now, DEFAULT, DAILY_CAP - 1, ZONE)).toEqual(now);
  });

  it("waits for the end of quiet hours", () => {
    const now = new Date("2026-10-12T02:30:00Z"); // 10:30 PM EDT
    expect(sendTime(now, DEFAULT, 0, ZONE)).toEqual(
      new Date("2026-10-12T13:00:00Z"), // 9 AM EDT
    );
  });

  it("waits until tomorrow once three have gone out today", () => {
    const now = new Date("2026-10-11T16:00:00Z");
    expect(sendTime(now, DEFAULT, DAILY_CAP, ZONE)).toEqual(
      new Date("2026-10-12T13:00:00Z"),
    );
    // Quiet hours that do not cover midnight: tomorrow starts at midnight.
    const lateNight = { startMinute: 1 * 60, endMinute: 6 * 60 };
    expect(sendTime(now, lateNight, DAILY_CAP, ZONE)).toEqual(
      new Date("2026-10-12T04:00:00Z"),
    );
  });

  it("keeps 9 AM on the wall clock across the fall-back change", () => {
    // Saturday, October 31, 2026, noon EDT; clocks fall back November 1.
    const now = new Date("2026-10-31T16:00:00Z");
    expect(sendTime(now, DEFAULT, DAILY_CAP, ZONE)).toEqual(
      new Date("2026-11-01T14:00:00Z"), // 9 AM EST
    );
  });
});

describe("local days", () => {
  it("finds midnight at the start of today and tomorrow", () => {
    const now = new Date("2026-10-11T16:20:31Z");
    expect(startOfDayIn(now, ZONE)).toEqual(new Date("2026-10-11T04:00:00Z"));
    expect(startOfNextDayIn(now, ZONE)).toEqual(
      new Date("2026-10-12T04:00:00Z"),
    );
  });

  it("handles a day that is 25 hours long", () => {
    const now = new Date("2026-11-01T20:00:00Z"); // 3 PM EST
    expect(startOfDayIn(now, ZONE)).toEqual(new Date("2026-11-01T04:00:00Z"));
    expect(startOfNextDayIn(now, ZONE)).toEqual(
      new Date("2026-11-02T05:00:00Z"),
    );
  });
});

describe("reminder window", () => {
  it("counts whole days, across months", () => {
    expect(daysBetween("2026-10-11", "2026-10-18")).toBe(7);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-10-11", "2026-10-10")).toBe(-1);
  });

  it("reminds from seven days out until the due date", () => {
    expect(inReminderWindow("2026-10-11", "2026-10-11")).toBe(true);
    expect(inReminderWindow("2026-10-11", "2026-10-18")).toBe(true);
    expect(inReminderWindow("2026-10-11", "2026-10-19")).toBe(false);
    expect(inReminderWindow("2026-10-11", "2026-10-10")).toBe(false);
  });
});
