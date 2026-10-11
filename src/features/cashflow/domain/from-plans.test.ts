import { describe, expect, it } from "vitest";
import type { PlannedSummary } from "@/features/plans";
import { cents } from "@/lib/money";
import { plansToEntries } from "./from-plans";
import type { AccountRecord } from "./from-records";

const CHECKING: AccountRecord = {
  id: "checking",
  type: "checking",
  nickname: "Everyday",
  balanceCents: cents(100000),
};
const CARD: AccountRecord = {
  id: "card",
  type: "credit_card",
  nickname: "Card",
  balanceCents: cents(-5000),
};
const LOAN: AccountRecord = {
  id: "loan",
  type: "loan",
  nickname: "Car loan",
  balanceCents: cents(-900000),
};

function plan(overrides: Partial<PlannedSummary> = {}): PlannedSummary {
  return {
    id: "plan-1",
    accountId: "checking",
    plannedOn: "2026-10-20",
    amountCents: cents(-4500),
    description: "Concert tickets",
    categoryId: null,
    categoryName: null,
    categoryPresetKey: null,
    ...overrides,
  };
}

describe("plansToEntries", () => {
  it("makes a removable, typed-in entry marked as a plan", () => {
    expect(plansToEntries([plan()], [CHECKING])).toEqual([
      {
        id: "plan-1",
        date: "2026-10-20",
        name: "Concert tickets",
        amount: -4500,
        kind: "everyday",
        category: "Uncategorized",
        source: "manual",
        accountName: undefined,
        onCard: false,
        removable: true,
        isPlan: true,
      },
    ]);
  });

  it("follows the transaction kinds: bills by category, money in as income", () => {
    const [rent, refund] = plansToEntries(
      [
        plan({
          id: "rent",
          categoryName: "Housing",
          categoryPresetKey: "housing",
        }),
        plan({ id: "refund", amountCents: cents(2000) }),
      ],
      [CHECKING],
    );

    expect(rent).toMatchObject({ kind: "bill", category: "Housing" });
    expect(refund).toMatchObject({ kind: "income" });
  });

  it("marks a card's plans and names accounts when there are several", () => {
    const [entry] = plansToEntries(
      [plan({ accountId: "card" })],
      [CHECKING, CARD],
    );

    expect(entry).toMatchObject({ onCard: true, accountName: "Card" });
  });

  it("leaves out plans on loan accounts and on unknown accounts", () => {
    expect(
      plansToEntries(
        [plan({ accountId: "loan" }), plan({ accountId: "gone" })],
        [CHECKING, LOAN],
      ),
    ).toEqual([]);
  });
});
