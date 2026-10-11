import { describe, expect, it } from "vitest";
import {
  canEditMonth,
  monthSchema,
  monthTitle,
  monthWindow,
  requestedMonth,
  shiftMonth,
  todayInZone,
} from "./months";
describe("calendar-month budgets", () => {
  it.each([
    ["2026-02-01T04:59:59Z", "2026-01-31"],
    ["2026-02-01T05:00:00Z", "2026-02-01"],
    ["2026-04-01T03:59:59Z", "2026-03-31"],
    ["2026-04-01T04:00:00Z", "2026-04-01"],
    ["2026-03-08T06:59:59Z", "2026-03-08"],
    ["2026-03-08T07:00:00Z", "2026-03-08"],
    ["2026-11-01T05:59:59Z", "2026-11-01"],
    ["2026-11-01T06:00:00Z", "2026-11-01"],
  ])("%s belongs to %s in the app's zone", (instant, expected) =>
    expect(todayInZone(new Date(instant))).toBe(expected),
  );
  it("supports an explicit time zone without the server's local zone", () =>
    expect(todayInZone(new Date("2026-02-01T00:30:00Z"), "Asia/Tokyo")).toBe(
      "2026-02-01",
    ));
  it.each([
    "2026-00",
    "2026-13",
    "2026-1",
    "1999-12",
    "2200-01",
    "2026-01-01",
    "garbage",
    "2026-01<script>",
  ])("rejects %s", (value) =>
    expect(monthSchema.safeParse(value).success).toBe(false),
  );
  it("shifts across years and formats a month without day/zone drift", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthTitle("2026-02")).toBe("February 2026");
  });
  it("respects leap years, month ends and today's cutoff", () => {
    expect(monthWindow("2024-02", "2026-10-11")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(monthWindow("2025-02", "2026-10-11").to).toBe("2025-02-28");
    expect(monthWindow("2026-09", "2026-10-11").to).toBe("2026-09-30");
    expect(monthWindow("2026-10", "2026-10-11").to).toBe("2026-10-11");
    expect(monthWindow("2026-11", "2026-10-11")).toEqual({
      from: "2026-11-01",
      to: "2026-10-11",
    });
  });
  it("only allows edits for the current or next month", () => {
    for (const month of ["2026-09", "2026-12"])
      expect(canEditMonth(month, "2026-10-11")).toBe(false);
    for (const month of ["2026-10", "2026-11"])
      expect(canEditMonth(month, "2026-10-11")).toBe(true);
  });
  it("defaults only an absent month; rejects arrays, malformed input and dates beyond next month", () => {
    expect(requestedMonth(undefined, "2026-10-11")).toBe("2026-10");
    expect(requestedMonth(null, "2026-10-11")).toBe("2026-10");
    for (const value of ["", ["2026-10"], "2026-12", "1999-12"])
      expect(requestedMonth(value, "2026-10-11")).toBeNull();
    expect(requestedMonth("2026-11", "2026-10-11")).toBe("2026-11");
    expect(requestedMonth("2000-01", "2026-10-11")).toBe("2000-01");
  });
});
