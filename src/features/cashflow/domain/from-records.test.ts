import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import { buildMonth, summarize } from "./cashflow";
import {
  type AccountRecord,
  type TransactionRecord,
  dashboardWindow,
  toCashflowData,
} from "./from-records";

const TODAY = "2026-10-11";

const CHECKING: AccountRecord = {
  id: "checking",
  type: "checking",
  nickname: "Everyday",
  balanceCents: cents(150000),
};
const SAVINGS: AccountRecord = {
  id: "savings",
  type: "savings",
  nickname: "Rainy day",
  balanceCents: cents(50000),
};
const CARD: AccountRecord = {
  id: "card",
  type: "credit_card",
  nickname: "Quicksilver",
  balanceCents: cents(-30000),
};
const LOAN: AccountRecord = {
  id: "loan",
  type: "loan",
  nickname: "Car loan",
  balanceCents: cents(-900000),
};

let next = 0;
function row(
  overrides: Partial<TransactionRecord> & Pick<TransactionRecord, "postedOn">,
): TransactionRecord {
  return {
    id: `t-${(next += 1)}`,
    accountId: CHECKING.id,
    amountCents: cents(-2500),
    description: "Corner Market",
    isTransfer: false,
    source: "csv",
    categoryName: "Groceries",
    categoryPresetKey: "groceries",
    editableInFull: false,
    ...overrides,
  };
}

describe("dashboardWindow", () => {
  it("spans two months back to two months ahead", () => {
    expect(dashboardWindow(TODAY)).toEqual({
      from: "2026-08-01",
      to: "2026-12-31",
    });
  });

  it("crosses a year boundary", () => {
    expect(dashboardWindow("2027-01-05")).toEqual({
      from: "2026-11-01",
      to: "2027-03-31",
    });
  });
});

describe("toCashflowData", () => {
  it("starts this month with the liquid balance when there are no rows", () => {
    const data = toCashflowData({
      accounts: [CHECKING, SAVINGS, CARD],
      transactions: [],
      today: TODAY,
    });

    expect(data).toEqual({
      start: { year: 2026, month: 10 },
      openingBalance: 200000,
      entries: [],
      recurring: [],
    });
  });

  it("has a zero balance with no accounts", () => {
    const data = toCashflowData({
      accounts: [],
      transactions: [],
      today: TODAY,
    });

    expect(summarize(data, TODAY).balanceToday).toBe(0);
  });

  it("works the opening balance back so today matches the stored balance", () => {
    const data = toCashflowData({
      accounts: [CHECKING],
      transactions: [
        row({ postedOn: "2026-09-20", amountCents: cents(-10000) }),
        row({ postedOn: "2026-10-01", amountCents: cents(200000) }),
        row({ postedOn: "2026-10-05", amountCents: cents(-4000) }),
      ],
      today: TODAY,
    });

    expect(data.start).toEqual({ year: 2026, month: 9 });
    expect(data.openingBalance).toBe(150000 + 10000 - 200000 + 4000);
    expect(summarize(data, TODAY).balanceToday).toBe(150000);
  });

  it("shows card rows as spending without moving the balance", () => {
    const data = toCashflowData({
      accounts: [CHECKING, CARD],
      transactions: [
        row({
          postedOn: "2026-10-05",
          accountId: CARD.id,
          amountCents: cents(-3000),
        }),
      ],
      today: TODAY,
    });
    const month = buildMonth(data, { year: 2026, month: 10 }, TODAY);

    expect(data.entries[0]).toMatchObject({
      onCard: true,
      accountName: "Quicksilver",
    });
    expect(data.openingBalance).toBe(150000);
    expect(month.days[4]).toMatchObject({ moneyOut: 3000, endBalance: 150000 });
    expect(summarize(data, TODAY).balanceToday).toBe(150000);
  });

  it("leaves out transfers and the loan account's own rows", () => {
    const data = toCashflowData({
      accounts: [CHECKING, CARD, LOAN],
      transactions: [
        row({ postedOn: "2026-10-02", isTransfer: true }),
        row({
          postedOn: "2026-10-02",
          accountId: CARD.id,
          amountCents: cents(2500),
          isTransfer: true,
        }),
        row({
          postedOn: "2026-10-03",
          accountId: LOAN.id,
          amountCents: cents(30000),
        }),
        row({ postedOn: "2026-10-04", description: "Kept" }),
      ],
      today: TODAY,
    });

    expect(data.entries.map((entry) => entry.name)).toEqual(["Kept"]);
  });

  it("leaves out rows from an account it was not given", () => {
    const data = toCashflowData({
      accounts: [CHECKING],
      transactions: [row({ postedOn: "2026-10-04", accountId: "elsewhere" })],
      today: TODAY,
    });

    expect(data.entries).toEqual([]);
  });

  it("keeps the start within two months back", () => {
    const data = toCashflowData({
      accounts: [CHECKING],
      transactions: [
        row({ postedOn: "2026-05-01", amountCents: cents(-99900) }),
        row({ postedOn: "2026-08-15" }),
      ],
      today: TODAY,
    });

    expect(data.start).toEqual({ year: 2026, month: 8 });
    expect(data.entries).toHaveLength(1);
    expect(data.openingBalance).toBe(150000 + 2500);
  });

  it("maps where each row came from", () => {
    const sources = [
      "manual",
      "text",
      "csv",
      "pdf",
      "plaid",
      "nessie",
      "synthetic",
    ];
    const data = toCashflowData({
      accounts: [CHECKING],
      transactions: sources.map((source) =>
        row({ postedOn: "2026-10-04", source }),
      ),
      today: TODAY,
    });

    expect(data.entries.map((entry) => entry.source)).toEqual([
      "manual",
      "text",
      "bank",
      "bank",
      "bank",
      "bank",
      "bank",
    ]);
  });

  it("reads money in as income, housing, utilities, insurance and loans as bills, the rest as spending", () => {
    const data = toCashflowData({
      accounts: [CHECKING],
      transactions: [
        row({
          postedOn: "2026-10-01",
          amountCents: cents(100000),
          categoryName: "Income",
          categoryPresetKey: "income",
        }),
        row({
          postedOn: "2026-10-01",
          categoryName: "Rent",
          categoryPresetKey: "housing",
        }),
        row({
          postedOn: "2026-10-02",
          categoryName: "Power",
          categoryPresetKey: "utilities",
        }),
        row({
          postedOn: "2026-10-02",
          categoryName: "Insurance",
          categoryPresetKey: "insurance",
        }),
        row({
          postedOn: "2026-10-02",
          categoryName: "Loans",
          categoryPresetKey: "loans",
        }),
        row({ postedOn: "2026-10-03" }),
        row({
          postedOn: "2026-10-03",
          categoryName: null,
          categoryPresetKey: null,
        }),
      ],
      today: TODAY,
    });

    expect(
      data.entries.map(({ kind, category }) => ({ kind, category })),
    ).toEqual([
      { kind: "income", category: "Income" },
      { kind: "bill", category: "Rent" },
      { kind: "bill", category: "Power" },
      { kind: "bill", category: "Insurance" },
      { kind: "bill", category: "Loans" },
      { kind: "everyday", category: "Groceries" },
      { kind: "everyday", category: "Uncategorized" },
    ]);
  });

  it("lets only typed rows be removed, and names accounts only when there are several", () => {
    const one = toCashflowData({
      accounts: [CHECKING],
      transactions: [
        row({ postedOn: "2026-10-04", source: "manual", editableInFull: true }),
        row({ postedOn: "2026-10-04" }),
      ],
      today: TODAY,
    });

    expect(one.entries.map((entry) => entry.removable)).toEqual([true, false]);
    expect(one.entries[0]?.accountName).toBeUndefined();
  });

  it("keeps a row dated after today out of today's balance", () => {
    const data = toCashflowData({
      accounts: [CHECKING],
      transactions: [
        row({ postedOn: "2026-10-20", amountCents: cents(-7000) }),
      ],
      today: TODAY,
    });

    expect(data.openingBalance).toBe(150000);
    expect(summarize(data, TODAY).balanceToday).toBe(150000);
  });
});

describe("recorded transfers preserve every balance", () => {
  it("keeps a card purchase as spending, excludes repayment from totals and preserves daily balances", () => {
    const accounts = [{ ...CHECKING, balanceCents: cents(50000) }, CARD];
    const transactions = [
      row({
        postedOn: "2026-10-01",
        accountId: CARD.id,
        amountCents: cents(-4500),
      }),
      row({ postedOn: "2026-10-05", amountCents: cents(-20000) }),
      row({
        postedOn: "2026-10-06",
        accountId: CARD.id,
        amountCents: cents(20000),
      }),
    ];
    const before = toCashflowData({ accounts, transactions, today: TODAY });
    const after = toCashflowData({
      accounts,
      transactions: transactions.map((r, i) => ({ ...r, isTransfer: i > 0 })),
      today: TODAY,
    });
    expect(after.openingBalance).toBe(70000);
    expect(
      buildMonth(after, { year: 2026, month: 10 }, TODAY).days.map(
        (d) => d.endBalance,
      ),
    ).toEqual(
      buildMonth(before, { year: 2026, month: 10 }, TODAY).days.map(
        (d) => d.endBalance,
      ),
    );
    expect(summarize(after, TODAY)).toMatchObject({
      balanceToday: 50000,
      monthIn: 0,
      monthOut: 4500,
      biggestCategory: { total: 4500, count: 1 },
    });
  });
  it.each([
    ["2026-09-30", "2026-10-02", TODAY],
    ["2026-12-31", "2027-01-02", "2027-01-05"],
  ])(
    "preserves liquid transfer timing across %s to %s",
    (outOn, inOn, today) => {
      const transactions = [
        row({ postedOn: outOn, amountCents: cents(-10001) }),
        row({
          postedOn: inOn,
          accountId: SAVINGS.id,
          amountCents: cents(10001),
        }),
      ];
      const before = toCashflowData({
        accounts: [CHECKING, SAVINGS],
        transactions,
        today,
      });
      const after = toCashflowData({
        accounts: [CHECKING, SAVINGS],
        transactions: transactions.map((r) => ({ ...r, isTransfer: true })),
        today,
      });
      expect(after.start).toEqual(before.start);
      for (const month of [
        before.start,
        { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) },
      ])
        expect(
          buildMonth(after, month, today).days.map((d) => d.endBalance),
        ).toEqual(
          buildMonth(before, month, today).days.map((d) => d.endBalance),
        );
      expect(summarize(after, today)).toMatchObject({
        balanceToday: 200000,
        monthIn: 0,
        monthOut: 0,
      });
      expect(after.entries).toEqual([]);
    },
  );
  it("preserves same-day checking to savings and excludes a labelled loan leg", () => {
    const data = toCashflowData({
      accounts: [CHECKING, SAVINGS, LOAN],
      transactions: [
        row({ postedOn: TODAY, amountCents: cents(-10000), isTransfer: true }),
        row({
          postedOn: TODAY,
          accountId: SAVINGS.id,
          amountCents: cents(10000),
          isTransfer: true,
        }),
        row({
          postedOn: TODAY,
          accountId: LOAN.id,
          amountCents: cents(10000),
          isTransfer: true,
        }),
      ],
      today: TODAY,
    });
    expect(summarize(data, TODAY)).toMatchObject({
      balanceToday: 200000,
      monthIn: 0,
      monthOut: 0,
    });
  });
});
