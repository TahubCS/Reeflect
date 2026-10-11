import { describe, expect, it } from "vitest";
import type { GeneratedPerson } from "@/features/synthetic";
import { cents } from "@/lib/money";
import { planSeed } from "./seed-plan";

const account = (
  key: string,
  type: string,
  nickname: string,
  opening: number,
) => ({
  key,
  type,
  nickname,
  mask: "1111",
  openingBalance: cents(opening),
  closingBalance: cents(0),
  lowestBalance: cents(0),
});

const tx = (
  n: number,
  accountKey: string,
  amount: number,
  description: string,
  kind: string,
  transferPair: string | null = null,
) => ({
  id: `demo:2026-10:${n}`,
  account: accountKey,
  postedOn: `2026-10-0${n}`,
  amount: cents(amount),
  description,
  kind,
  category: "other",
  transferPair,
});

const person = {
  key: "demo",
  name: "Demo",
  accounts: [
    account("checking", "checking", "360 Checking", 50000),
    account("card", "credit_card", "Credit Card", -12000),
  ],
  transactions: [
    tx(2, "card", -900, "Sheetz", "everyday"),
    tx(1, "checking", 150000, "Payroll", "income"),
    tx(3, "checking", -5000, "Card payment", "transfer", "t1"),
    tx(4, "card", 5000, "Card payment", "transfer", "t1"),
    tx(5, "checking", -80000, "Rent", "bill"),
  ],
} as unknown as GeneratedPerson;

describe("planSeed", () => {
  const plan = planSeed(person);

  it("opens accounts in whole dollars, with what a card owes as positive", () => {
    expect(plan.accounts).toEqual([
      {
        key: "checking",
        type: "Checking",
        nickname: "360 Checking",
        balance: 500,
      },
      {
        key: "card",
        type: "Credit Card",
        nickname: "Credit Card",
        balance: 120,
      },
    ]);
  });

  it("sends records oldest first, each with status and a whole-dollar amount", () => {
    expect(
      plan.records.map((r) => [r.sourceId, r.kind, r.body.amount]),
    ).toEqual([
      ["demo:2026-10:1", "deposit", 1500],
      ["demo:2026-10:2", "purchase", 9],
      ["demo:2026-10:3", "withdrawal", 50],
      ["demo:2026-10:4", "deposit", 50],
      ["demo:2026-10:5", "withdrawal", 800],
    ]);
    for (const r of plan.records) expect(r.body.status).toBe("completed");
  });

  it("tags both sides of a transfer and makes a merchant per purchase place", () => {
    expect(
      plan.records.filter((r) => r.body.description.includes("[xfer:t1]")),
    ).toHaveLength(2);
    expect(plan.merchants).toEqual([{ name: "Sheetz", category: "other" }]);
  });

  it("refuses amounts with cents", () => {
    const withCents = {
      ...person,
      transactions: [tx(1, "card", -950, "Sheetz", "everyday")],
    } as unknown as GeneratedPerson;
    expect(() => planSeed(withCents)).toThrow(RangeError);
  });
});
