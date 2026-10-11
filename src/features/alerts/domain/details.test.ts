import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import { billDetails, subscriptionDetails } from "./details";

describe("subscriptionDetails", () => {
  it("gives the charge, the month and the year", () => {
    expect(
      subscriptionDetails({
        name: "Netflix",
        amount: cents(1549),
        fixed: true,
        cadence: "Monthly",
        monthly: cents(1549),
        yearly: cents(18588),
      }),
    ).toBe(
      "Netflix: $15.49 a charge (monthly), about $15.49 a month and $185.88 a year. Reply KEEP, CANCEL or IGNORE.",
    );
  });

  it("says about for a variable amount", () => {
    expect(
      subscriptionDetails({
        name: "Cloud",
        amount: cents(300),
        fixed: false,
        cadence: "Every two weeks",
        monthly: cents(650),
        yearly: cents(7821),
      }),
    ).toContain("Cloud: about $3.00 a charge (every two weeks)");
  });
});

describe("billDetails", () => {
  const base = {
    name: "Car loan",
    remaining: cents(32000),
    estimated: false,
    when: "on Friday, October 16",
    autopay: false,
    liquid: cents(100000),
  };

  it("gives the amount and the date", () => {
    expect(billDetails(base)).toBe(
      "Car loan: $320.00 due on Friday, October 16.",
    );
  });

  it("labels an estimate and autopay", () => {
    const text = billDetails({ ...base, estimated: true, autopay: true });
    expect(text).toContain("about $320.00");
    expect(text).toContain("estimate");
    expect(text).toContain("paid automatically");
  });

  it("adds the low-balance line only when the balance is short", () => {
    expect(billDetails({ ...base, liquid: cents(25000) })).toContain(
      "Your balance is $250.00, which is less than this payment.",
    );
    expect(billDetails({ ...base, liquid: cents(32000) })).not.toContain(
      "balance",
    );
    expect(billDetails({ ...base, liquid: null })).not.toContain("balance");
  });
});
