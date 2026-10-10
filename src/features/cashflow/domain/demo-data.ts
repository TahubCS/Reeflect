import { cents } from "@/lib/money";
import type { CashflowData, Entry, Kind, Source } from "./cashflow";

// Synthetic data for the design check. Amounts are cents, written dollars_cents.

/** The preview is pinned to one day, so it looks the same whenever it is opened. */
export const TODAY = "2026-10-07";

export const SPENDING_CATEGORIES = [
  "Groceries",
  "Eating out",
  "Coffee",
  "Transport",
  "Shopping",
  "Fun",
  "Other",
];

let nextId = 0;
const entry = (
  day: number,
  name: string,
  amount: number,
  kind: Kind,
  category: string,
  source: Source = "bank",
): Entry => ({
  id: `demo-${(nextId += 1)}`,
  date: `2026-10-${String(day).padStart(2, "0")}`,
  name,
  amount: cents(amount),
  kind,
  category,
  source,
});

export const DEMO_DATA: CashflowData = {
  start: { year: 2026, month: 10 },
  openingBalance: cents(1_940_00),
  entries: [
    entry(1, "Rent", -1_200_00, "bill", "Housing"),
    entry(2, "Corner Market", -64_12, "everyday", "Groceries"),
    entry(2, "Daily Grind", -5_75, "everyday", "Coffee"),
    entry(3, "Noodle Bar", -23_40, "everyday", "Eating out"),
    entry(3, "Gas station", -38_00, "everyday", "Transport"),
    entry(5, "Corner Market", -41_87, "everyday", "Groceries"),
    entry(5, "Internet", -60_00, "bill", "Utilities"),
    entry(6, "Taco Stand", -31_20, "everyday", "Eating out"),
    entry(6, "Daily Grind", -6_25, "everyday", "Coffee", "text"),
    entry(7, "Thrift shop, cash", -27_99, "everyday", "Shopping", "manual"),
  ],
  recurring: [
    {
      id: "pay-1",
      name: "Paycheck",
      amount: cents(1_450_00),
      kind: "income",
      category: "Pay",
      day: 15,
    },
    {
      id: "pay-2",
      name: "Paycheck",
      amount: cents(1_450_00),
      kind: "income",
      category: "Pay",
      day: 30,
    },
    {
      id: "rent",
      name: "Rent",
      amount: cents(-1_200_00),
      kind: "bill",
      category: "Housing",
      day: 1,
    },
    {
      id: "internet",
      name: "Internet",
      amount: cents(-60_00),
      kind: "bill",
      category: "Utilities",
      day: 5,
    },
    {
      id: "insurance",
      name: "Car insurance",
      amount: cents(-118_40),
      kind: "bill",
      category: "Insurance",
      day: 12,
    },
    {
      id: "phone",
      name: "Phone",
      amount: cents(-45_00),
      kind: "bill",
      category: "Utilities",
      day: 18,
    },
    {
      id: "electric",
      name: "Electricity",
      amount: cents(-86_20),
      kind: "bill",
      category: "Utilities",
      day: 22,
    },
    {
      id: "streaming",
      name: "Streaming",
      amount: cents(-15_49),
      kind: "subscription",
      category: "Subscriptions",
      day: 9,
    },
    {
      id: "music",
      name: "Music",
      amount: cents(-11_99),
      kind: "subscription",
      category: "Subscriptions",
      day: 14,
    },
    {
      id: "gym",
      name: "Gym",
      amount: cents(-35_00),
      kind: "subscription",
      category: "Subscriptions",
      day: 20,
    },
    {
      id: "cloud",
      name: "Cloud storage",
      amount: cents(-2_99),
      kind: "subscription",
      category: "Subscriptions",
      day: 25,
    },
  ],
};
