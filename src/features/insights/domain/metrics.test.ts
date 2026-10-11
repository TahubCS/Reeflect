import { describe, expect, it } from "vitest";
import type { PresetKey } from "@/features/categorization/client";
import { cents } from "@/lib/money";
import {
  type AccountKind,
  type MetricRow,
  checkingBalanceAt,
  measure,
  storedCents,
  toStored,
} from "./metrics";
import { periodEnding } from "./periods";

function row(
  postedOn: string,
  amount: number,
  presetKey: PresetKey | null,
  extra: Partial<{
    isTransfer: boolean;
    accountType: AccountKind;
    merchant: string;
  }> = {},
): MetricRow {
  return {
    postedOn,
    amount: cents(amount),
    presetKey,
    isTransfer: extra.isTransfer ?? false,
    accountType: extra.accountType ?? "checking",
    merchant: extra.merchant ?? "shop",
  };
}

// 30 days ending 2026-09-30: per month is total × 30.4375 ÷ 30.
const period = periodEnding("2026-09-30", 30);
const options = {
  period,
  dataFrom: "2026-01-01",
  checkingAtEnd: cents(50_000),
};
const monthly = (total: number) => Math.round((total * 30.4375) / 30);

describe("measure", () => {
  it("adds up take-home, spending by category, kept and bills", () => {
    const m = measure(
      [
        row("2026-09-01", 300_000, "income"),
        row("2026-09-02", 5_000, null), // Uncategorized money in: take-home.
        row("2026-09-03", -120_000, "housing"),
        row("2026-09-04", -8_000, "groceries"),
        row("2026-09-05", 2_000, "groceries"), // A refund.
        row("2026-09-06", -3_000, null),
      ],
      options,
    )!;
    expect(m.coveredDays).toBe(30);
    expect(m.takeHome).toBe(monthly(305_000));
    expect(m.byCategory).toEqual({
      housing: monthly(120_000),
      groceries: monthly(6_000),
      uncategorized: monthly(3_000),
    });
    expect(m.spending).toBe(monthly(129_000));
    expect(m.kept).toBe(monthly(305_000 - 129_000));
    expect(m.bills).toBe(monthly(120_000));
  });

  it("never counts transfers as spending or income, and counts saving (ADR-020, ADR-055)", () => {
    const m = measure(
      [
        row("2026-09-01", -50_000, null, { isTransfer: true }),
        row("2026-09-01", 50_000, null, {
          isTransfer: true,
          accountType: "savings",
        }),
        row("2026-09-10", -10_000, null, {
          isTransfer: true,
          accountType: "savings",
        }),
        row("2026-09-10", 10_000, null, { isTransfer: true }),
        // A card payment: both sides are transfers.
        row("2026-09-12", -20_000, null, { isTransfer: true }),
        row("2026-09-12", 20_000, null, {
          isTransfer: true,
          accountType: "credit_card",
        }),
        // An IRA and a brokerage, unpaired but marked (ADR-055).
        row("2026-09-15", -25_000, "retirement", { isTransfer: true }),
        row("2026-09-15", -10_000, "investing", { isTransfer: true }),
      ],
      options,
    )!;
    expect(m.spending).toBe(0);
    expect(m.takeHome).toBe(0);
    expect(m.saved).toBe(monthly(40_000 + 35_000));
    expect(m.byCategory).toEqual({});
  });

  it("counts subscription merchants and their cost", () => {
    const m = measure(
      [
        row("2026-09-03", -1_599, "subscriptions", { merchant: "netflix" }),
        row("2026-09-04", -999, "subscriptions", { merchant: "spotify" }),
        row("2026-09-20", -999, "subscriptions", { merchant: "spotify" }),
      ],
      options,
    )!;
    expect(m.subscriptionCount).toBe(2);
    expect(m.subscriptionCost).toBe(monthly(3_597));
  });

  it("counts no-spend days, where bills and subscriptions don't break one", () => {
    const m = measure(
      [
        row("2026-09-01", -120_000, "housing"),
        row("2026-09-02", -999, "subscriptions"),
        row("2026-09-03", -500, "dining"),
        row("2026-09-03", -700, "groceries"),
        row("2026-09-04", -300, null),
        row("2026-09-05", 300, "shopping"), // A refund alone isn't spending.
      ],
      options,
    )!;
    // 30 days, two with day-to-day spending.
    expect(m.noSpendDays).toBe(Math.round((28 * 30.4375) / 30));
  });

  it("finds the lowest end-of-day checking balance, walking back from the end", () => {
    const m = measure(
      [
        row("2026-09-29", 300_000, "income"),
        row("2026-09-28", -40_000, "housing"),
        row("2026-09-30", -1_000, "dining"),
        // Savings rows don't move checking.
        row("2026-09-28", -999_999, null, {
          isTransfer: true,
          accountType: "savings",
        }),
      ],
      { ...options, checkingAtEnd: cents(10_000) },
    )!;
    // End of 30th: 100.00; end of 29th: 110.00; end of 28th: −2,890.00.
    expect(m.lowestBalance).toBe(-289_000);
    expect(
      measure([], { ...options, checkingAtEnd: null })!.lowestBalance,
    ).toBeNull();
  });

  it("skips rows outside the period and averages over the days covered", () => {
    const m = measure(
      [
        row("2026-08-31", -99_000, "dining"),
        row("2026-10-01", -99_000, "dining"),
        row("2026-09-30", -10_000, "dining"),
      ],
      { ...options, dataFrom: "2026-09-21" },
    )!;
    expect(m.coveredDays).toBe(10);
    expect(m.byCategory.dining).toBe(Math.round((10_000 * 30.4375) / 10));
  });

  it("has nothing to say before the data starts", () => {
    expect(measure([], { ...options, dataFrom: "2026-10-01" })).toBeNull();
    expect(measure([], { ...options, dataFrom: null })).toBeNull();
  });

  it("stores one number per measure and reads money back as cents", () => {
    const m = measure([row("2026-09-04", -8_000, "groceries")], options)!;
    const stored = toStored(m);
    expect(stored["category:groceries"]).toBe(monthly(8_000));
    expect(stored.lowest_balance).toBe(50_000);
    expect(storedCents(stored, "spending")).toBe(monthly(8_000));
    expect(storedCents(stored, "category:dining")).toBe(0);
    const noChecking = toStored(
      measure([], { ...options, checkingAtEnd: null })!,
    );
    expect("lowest_balance" in noChecking).toBe(false);
  });
});

describe("checkingBalanceAt", () => {
  it("undoes rows after the date, up to each balance's own date", () => {
    const accounts = [
      { id: "a", balance: cents(10_000), asOf: "2026-10-10" },
      { id: "b", balance: cents(5_000), asOf: null },
    ];
    const rows = [
      { accountId: "a", postedOn: "2026-10-05", amount: cents(2_000) },
      { accountId: "a", postedOn: "2026-09-30", amount: cents(-7_000) },
      // After a's balance date: not in its balance yet.
      { accountId: "a", postedOn: "2026-10-11", amount: cents(-99_999) },
      { accountId: "b", postedOn: "2026-10-01", amount: cents(-1_000) },
    ];
    expect(checkingBalanceAt("2026-09-30", accounts, rows)).toBe(8_000 + 6_000);
    expect(checkingBalanceAt("2026-09-30", [], rows)).toBeNull();
  });
});
