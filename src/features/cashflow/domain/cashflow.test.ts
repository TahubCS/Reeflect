import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import {
  type CashflowData,
  type Entry,
  type Recurring,
  buildMonth,
  occurrences,
  sourceCounts,
  subscriptionCosts,
  summarize,
} from "./cashflow";

const FEBRUARY = { year: 2026, month: 2 };
const TODAY = "2026-02-10";

function entry(overrides: Partial<Entry> & Pick<Entry, "date">): Entry {
  return {
    id: `entry-${overrides.date}-${overrides.name ?? "x"}`,
    name: "Corner Market",
    amount: cents(-5000),
    kind: "everyday",
    category: "Groceries",
    source: "bank",
    ...overrides,
  };
}

/** Monthly on `day`, anchored in January 2026 so short months clamp. */
function monthlyOn(day: number) {
  return {
    unit: "months" as const,
    every: 1,
    nextOn: `2026-01-${String(day).padStart(2, "0")}`,
  };
}

function yearOf(amount: number) {
  const monthly = cents(Math.abs(amount));
  return { monthly, yearly: cents(Math.abs(amount) * 12) };
}

const PAYCHECK: Recurring = {
  id: "pay",
  name: "Paycheck",
  amount: cents(200000),
  kind: "income",
  category: "Pay",
  ...monthlyOn(15),
  ...yearOf(200000),
};

function bill(day: number, amount: number, id = `bill-${day}`): Recurring {
  return {
    id,
    name: "Rent",
    amount: cents(amount),
    kind: "bill",
    category: "Housing",
    ...monthlyOn(day),
    ...yearOf(amount),
  };
}

function data(overrides: Partial<CashflowData> = {}): CashflowData {
  return {
    start: FEBRUARY,
    openingBalance: cents(100000),
    entries: [],
    recurring: [],
    ...overrides,
  };
}

describe("buildMonth", () => {
  it("has one day per day of the month, with blanks before the 1st", () => {
    const october = buildMonth(data(), { year: 2026, month: 10 }, TODAY);

    expect(buildMonth(data(), FEBRUARY, TODAY).days).toHaveLength(28);
    expect(october.days).toHaveLength(31);
    // October 1, 2026 is a Thursday.
    expect(october.leadingBlanks).toBe(4);
  });

  it("marks today and the days after it", () => {
    const { days } = buildMonth(data(), FEBRUARY, TODAY);

    expect(days[8]).toMatchObject({ day: 9, isToday: false, isFuture: false });
    expect(days[9]).toMatchObject({ day: 10, isToday: true, isFuture: false });
    expect(days[10]).toMatchObject({ day: 11, isToday: false, isFuture: true });
  });

  it("totals a day's money in, money out and day-to-day spending", () => {
    const month = buildMonth(
      data({
        entries: [
          entry({ date: "2026-02-03", amount: cents(-5000) }),
          entry({
            date: "2026-02-03",
            name: "Internet",
            amount: cents(-6000),
            kind: "bill",
          }),
          entry({
            date: "2026-02-03",
            name: "Refund",
            amount: cents(1500),
            kind: "income",
          }),
          entry({ date: "2026-02-05", amount: cents(-2000) }),
        ],
      }),
      FEBRUARY,
      TODAY,
    );

    expect(month.days[2]).toMatchObject({
      moneyIn: 1500,
      moneyOut: 11000,
      everydaySpent: 5000,
      endBalance: 100000 - 5000 - 6000 + 1500,
    });
    expect(month.largestEverydaySpend).toBe(5000);
  });

  it("ends the month at its starting balance plus every item", () => {
    const month = buildMonth(
      data({
        entries: [entry({ date: "2026-02-03", amount: cents(-5000) })],
        recurring: [PAYCHECK, bill(20, -40000)],
      }),
      FEBRUARY,
      TODAY,
    );

    expect(month.days.at(-1)?.endBalance).toBe(100000 - 5000 + 200000 - 40000);
  });

  it("carries the balance of earlier months into later ones", () => {
    const march = buildMonth(
      data({ recurring: [PAYCHECK, bill(20, -40000)] }),
      { year: 2026, month: 3 },
      TODAY,
    );
    const endOfFebruary = 100000 + 200000 - 40000;

    expect(march.days[0]?.endBalance).toBe(endOfFebruary);
    expect(march.days.at(-1)?.endBalance).toBe(endOfFebruary + 200000 - 40000);
  });

  it("puts a repeating item due on the 31st on the last day of a short month", () => {
    const rent = bill(31, -40000, "rent");

    const february = buildMonth(data({ recurring: [rent] }), FEBRUARY, TODAY);
    const leapFebruary = buildMonth(
      data({ recurring: [rent] }),
      { year: 2028, month: 2 },
      TODAY,
    );

    expect(february.days[27]?.items).toMatchObject([
      {
        id: "rent@2026-02-28",
        date: "2026-02-28",
        planned: true,
        recurringId: "rent",
      },
    ]);
    expect(leapFebruary.days[28]?.items).toHaveLength(1);
  });

  it("expects a repeating item only after today, so past ones are not doubled", () => {
    const month = buildMonth(
      data({ recurring: [bill(5, -6000), bill(10, -100)] }),
      FEBRUARY,
      TODAY,
    );

    expect(month.days[4]?.items).toEqual([]);
    expect(month.days[9]?.items).toEqual([]);
  });

  it("treats an entry dated after today as planned", () => {
    const month = buildMonth(
      data({
        entries: [entry({ date: "2026-02-03" }), entry({ date: "2026-02-20" })],
      }),
      FEBRUARY,
      TODAY,
    );

    expect(month.days[2]?.items[0]?.planned).toBe(false);
    expect(month.days[19]?.items[0]?.planned).toBe(true);
  });

  it("calls a day no-spend only when it has passed with nothing going out", () => {
    const month = buildMonth(
      data({
        entries: [
          entry({ date: "2026-02-03", amount: cents(-5000) }),
          entry({
            date: "2026-02-04",
            name: "Refund",
            amount: cents(1500),
            kind: "income",
          }),
        ],
      }),
      FEBRUARY,
      TODAY,
    );

    expect(month.days[1]?.noSpend).toBe(true);
    expect(month.days[2]?.noSpend).toBe(false);
    // Money coming in does not stop a no-spend day.
    expect(month.days[3]?.noSpend).toBe(true);
    // Today is not over, and the future has not happened.
    expect(month.days[9]?.noSpend).toBe(false);
    expect(month.days[10]?.noSpend).toBe(false);
  });
});

describe("summarize: the per-day amount", () => {
  const withBill = (amount: number) =>
    summarize(data({ recurring: [PAYCHECK, bill(12, amount)] }), TODAY);

  it("divides what is left after bills by the days until payday", () => {
    const summary = withBill(-30000);

    expect(summary).toMatchObject({
      balanceToday: 100000,
      payday: { date: "2026-02-15", daysAway: 5 },
      dueTotal: 30000,
      freeToSpend: 70000,
      perDay: 14000,
    });
    expect(summary.dueBeforePayday).toHaveLength(1);
  });

  it("is zero when the bills equal the balance", () => {
    expect(withBill(-100000)).toMatchObject({ freeToSpend: 0, perDay: 0 });
  });

  it("is never negative when the bills exceed the balance", () => {
    expect(withBill(-150000)).toMatchObject({
      dueTotal: 150000,
      freeToSpend: 0,
      perDay: 0,
    });
  });

  it("rounds down to the cent", () => {
    const summary = summarize(
      data({ openingBalance: cents(100001), recurring: [PAYCHECK] }),
      "2026-02-12",
    );

    // $1,000.01 over 3 days.
    expect(summary.perDay).toBe(33333);
  });

  it("uses one day when payday is tomorrow", () => {
    const summary = summarize(
      data({ recurring: [{ ...PAYCHECK, ...monthlyOn(11) }] }),
      TODAY,
    );

    expect(summary.payday).toEqual({ date: "2026-02-11", daysAway: 1 });
    expect(summary.perDay).toBe(100000);
  });

  it("leaves out bills that fall on or after payday", () => {
    const summary = withBill(-30000);
    const later = summarize(
      data({ recurring: [PAYCHECK, bill(15, -30000), bill(20, -30000)] }),
      TODAY,
    );

    expect(summary.dueTotal).toBe(30000);
    expect(later.dueTotal).toBe(0);
  });

  it("finds a payday that falls next month", () => {
    const summary = summarize(
      data({ recurring: [PAYCHECK, bill(25, -30000)] }),
      "2026-02-20",
    );

    expect(summary.payday).toEqual({ date: "2026-03-15", daysAway: 23 });
    expect(summary.dueTotal).toBe(30000);
  });

  it("shows no payday and no per-day amount when no income is expected", () => {
    const summary = summarize(data({ recurring: [bill(12, -30000)] }), TODAY);

    expect(summary.payday).toBeNull();
    expect(summary.perDay).toBe(0);
    // Everything going out this month and next counts as due.
    expect(summary.dueBeforePayday).toHaveLength(2);
    expect(summary.dueTotal).toBe(60000);
    expect(summary.freeToSpend).toBe(40000);
  });
});

describe("summarize: the month so far", () => {
  it("totals money in and out up to today and counts no-spend days", () => {
    const summary = summarize(
      data({
        entries: [
          entry({
            date: "2026-02-02",
            name: "Side job",
            amount: cents(8000),
            kind: "income",
          }),
          entry({ date: "2026-02-03", amount: cents(-5000) }),
          entry({ date: "2026-02-20", amount: cents(-9999) }),
        ],
      }),
      TODAY,
    );

    expect(summary.monthIn).toBe(8000);
    expect(summary.monthOut).toBe(5000);
    // February 1 to 9, except the 3rd.
    expect(summary.noSpendDays).toBe(8);
  });

  it("names the category with the most day-to-day spending", () => {
    const summary = summarize(
      data({
        entries: [
          entry({ date: "2026-02-02", amount: cents(-3000) }),
          entry({ date: "2026-02-03", amount: cents(-3000) }),
          entry({
            date: "2026-02-04",
            name: "Noodle Bar",
            amount: cents(-5000),
            category: "Eating out",
          }),
          // Not day-to-day spending, and a refund: neither counts.
          entry({
            date: "2026-02-05",
            name: "Rent",
            amount: cents(-90000),
            kind: "bill",
            category: "Housing",
          }),
          entry({
            date: "2026-02-06",
            name: "Return",
            amount: cents(7000),
            category: "Shopping",
          }),
        ],
      }),
      TODAY,
    );

    expect(summary.biggestCategory).toEqual({
      name: "Groceries",
      total: 6000,
      count: 2,
    });
  });

  it("has no biggest category before any day-to-day spending", () => {
    expect(summarize(data(), TODAY).biggestCategory).toBeNull();
  });
});

describe("sourceCounts", () => {
  it("counts this month's entries by source and ignores other months", () => {
    const counts = sourceCounts(
      data({
        entries: [
          entry({ date: "2026-02-02" }),
          entry({ date: "2026-02-03", source: "text" }),
          entry({ date: "2026-02-04", source: "text" }),
          entry({ date: "2026-02-05", source: "manual" }),
          entry({ date: "2026-01-31", source: "manual" }),
        ],
      }),
      TODAY,
    );

    expect(counts).toEqual({ bank: 1, manual: 1, text: 2 });
  });
});

describe("subscriptionCosts", () => {
  const subscription = (id: string, amount: number): Recurring => ({
    id,
    name: id,
    amount: cents(amount),
    kind: "subscription",
    category: "Subscriptions",
    ...monthlyOn(9),
    ...yearOf(amount),
  });
  const recurring = [
    subscription("streaming", -1549),
    subscription("gym", -3500),
    bill(1, -120000),
  ];

  it("gives the monthly and yearly cost of subscriptions only", () => {
    expect(subscriptionCosts(data({ recurring }), new Set())).toEqual({
      count: 2,
      monthly: 5049,
      yearly: 60588,
      markedCount: 0,
      yearlySavingIfCancelled: 0,
    });
  });

  it("gives a year's saving for the ones marked planning to cancel", () => {
    const costs = subscriptionCosts(
      data({ recurring }),
      new Set(["gym", "bill-1"]),
    );

    expect(costs.markedCount).toBe(1);
    expect(costs.yearlySavingIfCancelled).toBe(42000);
  });
});

describe("card rows", () => {
  const card = (date: string, amount: number) =>
    entry({ date, name: "Card purchase", amount: cents(amount), onCard: true });

  it("count as spending but leave the balance line alone", () => {
    const month = buildMonth(
      data({
        entries: [
          card("2026-02-03", -3000),
          entry({ date: "2026-02-03", amount: cents(-1000) }),
        ],
      }),
      FEBRUARY,
      TODAY,
    );

    expect(month.days[2]).toMatchObject({
      moneyOut: 4000,
      everydaySpent: 4000,
      endBalance: 100000 - 1000,
      noSpend: false,
    });
  });

  it("do not carry into later months' balances", () => {
    const march = buildMonth(
      data({ entries: [card("2026-02-03", -3000)] }),
      { year: 2026, month: 3 },
      TODAY,
    );

    expect(march.days[0]?.endBalance).toBe(100000);
  });

  it("are neither a payday nor owed before one", () => {
    const summary = summarize(
      data({
        entries: [card("2026-02-12", 5000), card("2026-02-13", -2000)],
        recurring: [PAYCHECK, bill(14, -10000)],
      }),
      TODAY,
    );

    expect(summary.payday?.date).toBe("2026-02-15");
    expect(summary.dueTotal).toBe(10000);
    expect(summary.balanceToday).toBe(100000);
  });

  it("count toward the month's spending and biggest category", () => {
    const summary = summarize(
      data({ entries: [card("2026-02-03", -3000)] }),
      TODAY,
    );

    expect(summary.monthOut).toBe(3000);
    expect(summary.biggestCategory).toEqual({
      name: "Groceries",
      total: 3000,
      count: 1,
    });
  });
});

describe("occurrences", () => {
  const every = (
    unit: "days" | "months",
    n: number,
    nextOn: string,
  ): Recurring => ({
    ...PAYCHECK,
    unit,
    every: n,
    nextOn,
  });

  it("steps every 14 days from the next date, across months", () => {
    const rule = every("days", 14, "2026-02-13");

    expect(occurrences(rule, FEBRUARY)).toEqual(["2026-02-13", "2026-02-27"]);
    expect(occurrences(rule, { year: 2026, month: 3 })).toEqual([
      "2026-03-13",
      "2026-03-27",
    ]);
  });

  it("falls only in the right months for a quarterly item", () => {
    const rule = every("months", 3, "2026-01-20");

    expect(occurrences(rule, FEBRUARY)).toEqual([]);
    expect(occurrences(rule, { year: 2026, month: 4 })).toEqual(["2026-04-20"]);
    expect(occurrences(rule, { year: 2027, month: 1 })).toEqual(["2027-01-20"]);
  });

  it("has nothing before the next date", () => {
    expect(
      occurrences(every("months", 1, "2026-05-01"), { year: 2026, month: 3 }),
    ).toEqual([]);
  });

  it("lists a weekly item four or five times a month", () => {
    expect(occurrences(every("days", 7, "2026-02-02"), FEBRUARY)).toHaveLength(
      4,
    );
  });
});

describe("repeating items on a card", () => {
  it("show as expected spending without moving the balance line or the sum", () => {
    const cardSub: Recurring = {
      ...bill(20, -1500, "music"),
      kind: "subscription",
      onCard: true,
    };
    const month = buildMonth(
      data({ recurring: [PAYCHECK, cardSub] }),
      FEBRUARY,
      TODAY,
    );
    const summary = summarize(data({ recurring: [PAYCHECK, cardSub] }), TODAY);

    expect(month.days[19]?.items).toMatchObject([
      { name: "Rent", onCard: true, planned: true },
    ]);
    expect(month.days[19]?.endBalance).toBe(100000 + 200000);
    expect(summary.dueTotal).toBe(0);
  });
});

describe("subscriptionCosts with other schedules", () => {
  it("uses each item's yearly estimate, so a quarterly one is not counted monthly", () => {
    const quarterly: Recurring = {
      ...bill(1, -3000, "storage"),
      kind: "subscription",
      unit: "months",
      every: 3,
      monthly: cents(1000),
      yearly: cents(12000),
    };

    expect(
      subscriptionCosts(data({ recurring: [quarterly] }), new Set(["storage"])),
    ).toEqual({
      count: 1,
      monthly: 1000,
      yearly: 12000,
      markedCount: 1,
      yearlySavingIfCancelled: 12000,
    });
  });
});
