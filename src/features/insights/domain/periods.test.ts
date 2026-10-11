import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import {
  addDays,
  countPerMonth,
  coveredDays,
  daysIncluding,
  perMonth,
  periodEnding,
  periodSchema,
  yesterday,
} from "./periods";

describe("periods", () => {
  it("ends on the given day and counts it", () => {
    expect(periodEnding("2026-10-10", 30)).toEqual({
      days: 30,
      from: "2026-09-11",
      to: "2026-10-10",
    });
    expect(daysIncluding("2026-09-11", "2026-10-10")).toBe(30);
    // 2024 is a leap year, so the year ending March 1 starts March 3, 2023.
    expect(periodEnding("2024-03-01", 365).from).toBe("2023-03-03");
  });

  it("adds days across months and years", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("covers only the days there is data for", () => {
    const period = periodEnding("2026-10-10", 90);
    expect(coveredDays(period, "2025-01-01")).toBe(90);
    expect(coveredDays(period, "2026-10-01")).toBe(10);
    expect(coveredDays(period, "2026-10-10")).toBe(1);
    expect(coveredDays(period, "2026-10-11")).toBe(0);
    expect(coveredDays(period, null)).toBe(0);
  });

  it("scales a total to an average month of 30.4375 days", () => {
    expect(perMonth(cents(365_00), 365)).toBe(30_44);
    expect(perMonth(cents(-1_000_00), 30)).toBe(-1_014_58);
    expect(countPerMonth(10, 90)).toBe(3);
    expect(countPerMonth(30, 30)).toBe(30);
  });

  it("reads ?period= and falls back to three months", () => {
    expect(periodSchema.parse("30")).toBe(30);
    expect(periodSchema.parse("365")).toBe(365);
    expect(periodSchema.parse("31")).toBe(90);
    expect(periodSchema.parse(undefined)).toBe(90);
    expect(periodSchema.parse("abc")).toBe(90);
  });

  it("ends your period yesterday, in UTC", () => {
    expect(yesterday(new Date("2026-10-11T03:00:00Z"))).toBe("2026-10-10");
  });
});
