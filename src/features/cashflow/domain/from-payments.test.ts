import { describe, expect, it } from "vitest";
import type { Payment } from "@/features/recurring/client";
import { cents } from "@/lib/money";
import { toRecurring } from "./from-payments";
import type { AccountRecord } from "./from-records";

const CHECKING: AccountRecord = {
  id: "checking",
  type: "checking",
  nickname: "Everyday",
  balanceCents: cents(100000),
};
const CARD: AccountRecord = { ...CHECKING, id: "card", type: "credit_card" };
const LOAN: AccountRecord = { ...CHECKING, id: "loan", type: "loan" };

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    key: `["checking","${overrides.merchant ?? "stream service"}"]`,
    accountId: "checking",
    merchant: "stream service",
    name: "Streaming",
    decision: "confirmed",
    kind: "subscription",
    amountMode: "fixed",
    unit: "months",
    every: 1,
    cadence: "Monthly",
    useHistory: true,
    amount: cents(1599),
    low: cents(1599),
    high: cents(1599),
    monthly: cents(1599),
    yearly: cents(19188),
    actual: cents(0),
    nextOn: "2026-10-20",
    dateSource: "predicted",
    lastOn: "2026-09-20",
    active: true,
    manual: false,
    userIntent: "cancel",
    priceChanged: false,
    previousAmount: cents(1599),
    sampleCount: 3,
    timingScore: 100,
    charges: [],
    ...overrides,
  };
}

describe("toRecurring", () => {
  it("maps a confirmed subscription with its schedule, estimates and choice", () => {
    expect(toRecurring([payment()], [CHECKING])).toEqual([
      {
        id: '["checking","stream service"]',
        name: "Streaming",
        amount: -1599,
        kind: "subscription",
        category: "Subscriptions",
        unit: "months",
        every: 1,
        nextOn: "2026-10-20",
        onCard: false,
        monthly: 1599,
        yearly: 19188,
        userIntent: "cancel",
        target: { accountId: "checking", merchant: "stream service" },
      },
    ]);
  });

  it("signs pay as money in and bills as money out", () => {
    const [pay, rent] = toRecurring(
      [
        payment({
          kind: "income",
          merchant: "acme payroll",
          amount: cents(145000),
          unit: "days",
          every: 14,
        }),
        payment({ kind: "bill", merchant: "landlord", amount: cents(120000) }),
      ],
      [CHECKING],
    );

    expect(pay).toMatchObject({
      amount: 145000,
      category: "Pay",
      unit: "days",
      every: 14,
    });
    expect(rent).toMatchObject({ amount: -120000, category: "Bills" });
  });

  it("leaves out suggestions, dismissed and inactive payments, and ones with no next date", () => {
    expect(
      toRecurring(
        [
          payment({ decision: "candidate" }),
          payment({ decision: "dismissed" }),
          payment({ active: false }),
          payment({ nextOn: null }),
        ],
        [CHECKING],
      ),
    ).toEqual([]);
  });

  it("marks a card's payments and leaves out a loan's or an unknown account's", () => {
    const result = toRecurring(
      [
        payment({ accountId: "card" }),
        payment({ accountId: "loan" }),
        payment({ accountId: "elsewhere" }),
      ],
      [CHECKING, CARD, LOAN],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ onCard: true });
  });
});
