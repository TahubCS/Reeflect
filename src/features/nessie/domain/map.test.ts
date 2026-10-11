import { describe, expect, it } from "vitest";
import { computedBalance, mapAccountRecords, readTags } from "./map";
import type { AccountRecords, NessieAccount } from "./records";

const card: NessieAccount = {
  _id: "acct-card",
  type: "Credit Card",
  nickname: "Card",
  balance: 100,
};

function records(over: Partial<AccountRecords> = {}): AccountRecords {
  return {
    account: card,
    purchases: [],
    deposits: [],
    withdrawals: [],
    bills: [],
    ...over,
  };
}

describe("readTags", () => {
  it("removes transfer and refund tags and keeps the pair", () => {
    expect(readTags("Card payment [xfer:p-1]")).toEqual({
      text: "Card payment",
      transferPair: "p-1",
      category: null,
    });
    expect(readTags("Refund: Dinner [refund:abc]")).toEqual({
      text: "Refund: Dinner",
      transferPair: null,
      category: null,
    });
    expect(readTags("Plain")).toEqual({
      text: "Plain",
      transferPair: null,
      category: null,
    });
  });

  it("reads a category tag wherever it sits", () => {
    expect(readTags("Netflix [cat:subscriptions] monthly")).toEqual({
      text: "Netflix monthly",
      transferPair: null,
      category: "subscriptions",
    });
  });
});

describe("mapAccountRecords", () => {
  it("signs rows from the holder's view and drops cancelled ones", () => {
    const rows = mapAccountRecords(
      records({
        purchases: [
          {
            _id: "p1",
            purchase_date: "2026-10-01",
            amount: 90,
            status: "completed",
            description: "Dinner",
          },
          {
            _id: "p2",
            purchase_date: "2026-10-02",
            amount: 5,
            status: "cancelled",
          },
          {
            _id: "p3",
            purchase_date: "2026-10-03",
            amount: 12.1,
            status: "pending",
            merchant_id: "m1",
          },
        ],
        deposits: [
          {
            _id: "d1",
            transaction_date: "2026-10-04",
            amount: 200,
            status: "completed",
            description: "Card payment [xfer:pair-9]",
          },
        ],
        withdrawals: [
          {
            _id: "w1",
            transaction_date: "2026-09-30",
            amount: 15,
            status: "executed",
            description: "Fee",
          },
        ],
      }),
      new Map([["m1", "Sheetz"]]),
    );
    expect(
      rows.map((r) => [
        r.externalId,
        r.amountCents,
        r.status,
        r.descriptionRaw,
      ]),
    ).toEqual([
      ["withdrawal:w1", -1500, "posted", "Fee"],
      ["purchase:p1", -9000, "posted", "Dinner"],
      ["purchase:p3", -1210, "pending", "Sheetz"],
      ["deposit:d1", 20000, "posted", "Card payment"],
    ]);
    expect(rows.find((r) => r.externalId === "deposit:d1")).toMatchObject({
      isTransfer: true,
      transferPairId: "nessie:pair-9",
      fingerprint: "nessie:deposit:d1",
    });
  });

  it("gives the same rows for the same records (re-sync is idempotent)", () => {
    const input = records({
      purchases: [
        {
          _id: "p1",
          purchase_date: "2026-10-01",
          amount: 9,
          status: "completed",
        },
      ],
    });
    expect(mapAccountRecords(input)).toEqual(mapAccountRecords(input));
  });
});

describe("computedBalance", () => {
  it("treats a card's Nessie balance as owed and adds posted rows only", () => {
    const rows = mapAccountRecords(
      records({
        purchases: [
          {
            _id: "p1",
            purchase_date: "2026-10-01",
            amount: 90,
            status: "completed",
          },
          {
            _id: "p2",
            purchase_date: "2026-10-01",
            amount: 40,
            status: "pending",
          },
        ],
        deposits: [
          {
            _id: "d1",
            transaction_date: "2026-10-02",
            amount: 50,
            status: "completed",
          },
        ],
      }),
    );
    expect(computedBalance(card, rows)).toBe(-10000 - 9000 + 5000);
    expect(
      computedBalance({ ...card, type: "Checking", balance: 1000 }, rows),
    ).toBe(100000 - 9000 + 5000);
  });
});
