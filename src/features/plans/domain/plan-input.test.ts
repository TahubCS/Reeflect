import { describe, expect, it } from "vitest";
import { parsePlanForm } from "./plan-input";

const TODAY = "2026-10-11";
const LAST_DAY = "2026-12-31";
const ACCOUNT = "0199d5a0-0000-7000-8000-000000000001";
const CATEGORY = "0199d5a0-0000-7000-8000-000000000002";

const parse = (overrides: Record<string, unknown> = {}) =>
  parsePlanForm(
    {
      accountId: ACCOUNT,
      plannedOn: "2026-10-20",
      direction: "out",
      amount: "45.00",
      description: "Concert tickets",
      categoryId: CATEGORY,
      ...overrides,
    },
    { today: TODAY, lastDay: LAST_DAY },
  );

describe("parsePlanForm", () => {
  it("keeps money out negative, with its category", () => {
    expect(parse()).toEqual({
      ok: true,
      value: {
        accountId: ACCOUNT,
        plannedOn: "2026-10-20",
        amountCents: -4500,
        description: "Concert tickets",
        categoryId: CATEGORY,
      },
    });
  });

  it("keeps money in positive and drops a spending category", () => {
    expect(parse({ direction: "in", amount: "300" })).toMatchObject({
      ok: true,
      value: { amountCents: 30000, categoryId: null },
    });
  });

  it("accepts tomorrow and the calendar's last day", () => {
    expect(parse({ plannedOn: "2026-10-12" }).ok).toBe(true);
    expect(parse({ plannedOn: LAST_DAY }).ok).toBe(true);
  });

  it("refuses today and earlier days", () => {
    for (const plannedOn of [TODAY, "2026-10-01"]) {
      expect(parse({ plannedOn })).toEqual({
        ok: false,
        errors: { plannedOn: "Choose a day after today." },
      });
    }
  });

  it("refuses a day after the calendar's last day", () => {
    expect(parse({ plannedOn: "2027-01-01" })).toEqual({
      ok: false,
      errors: { plannedOn: "Choose a day the calendar shows." },
    });
  });

  it("refuses dates that are not real", () => {
    for (const plannedOn of ["", "2026-02-30", "20/10/2026", undefined]) {
      expect(parse({ plannedOn })).toMatchObject({
        ok: false,
        errors: { plannedOn: "Enter a date." },
      });
    }
  });

  it("refuses a zero, negative or unreadable amount", () => {
    for (const amount of ["0", "-5", "lots", ""]) {
      expect(parse({ amount })).toEqual({
        ok: false,
        errors: { amount: "Enter an amount above zero, like 12.50." },
      });
    }
  });

  it("needs a description of 200 characters or fewer", () => {
    expect(parse({ description: "  " })).toMatchObject({
      ok: false,
      errors: { description: expect.stringContaining("Say what it is") },
    });
    expect(parse({ description: "x".repeat(201) })).toMatchObject({
      ok: false,
      errors: { description: "Use 200 characters or fewer." },
    });
  });

  it("needs an account, a direction and a real category id", () => {
    expect(
      parse({ accountId: "nope", direction: "sideways", categoryId: "x" }),
    ).toEqual({
      ok: false,
      errors: {
        accountId: "Choose an account.",
        direction: "Choose money out or money in.",
        categoryId: "Choose one of your categories.",
      },
    });
  });

  it("refuses input that is not an object", () => {
    expect(parsePlanForm(null, { today: TODAY, lastDay: LAST_DAY }).ok).toBe(
      false,
    );
  });
});
