// One person's measures for one period (ADR-056). Pure: the same function
// computes a sample person's stored figures at batch load and your figures
// on request, from the same plain row shape.
import type { PresetKey } from "@/features/categorization/client";
import { type Cents, ZERO, add, cents, negate, subtract } from "@/lib/money";
import {
  type IsoDate,
  type Period,
  addDays,
  countPerMonth,
  coveredDays,
  perMonth,
} from "./periods";

export type AccountKind = "checking" | "savings" | "credit_card" | "loan";

/** What metrics need from a transaction, from the generator or the database. */
export type MetricRow = {
  postedOn: IsoDate;
  amount: Cents;
  isTransfer: boolean;
  /** The effective category's preset key; null when Uncategorized. */
  presetKey: PresetKey | null;
  accountType: AccountKind;
  /** F-08's cleaned-up merchant name, to count subscriptions. */
  merchant: string;
};

/** Money into these is saving, never spending (ADR-055). */
const SAVING_PRESETS = new Set<PresetKey>(["retirement", "investing"]);
export const BILL_PRESETS: readonly PresetKey[] = [
  "housing",
  "utilities",
  "insurance",
  "loans",
];
/** Not day-to-day: a day with only these still counts as a no-spend day. */
const FIXED_PRESETS = new Set<PresetKey>([...BILL_PRESETS, "subscriptions"]);

/** A category spending is counted under; Uncategorized is its own bucket. */
export type SpendingKey =
  Exclude<PresetKey, "income" | "retirement" | "investing"> | "uncategorized";

export type Measures = {
  /** Days of the period the data covers; per-month figures divide by this. */
  coveredDays: number;
  /** Money in that isn't a transfer or a refund, per month. */
  takeHome: Cents;
  /** Money out that isn't a transfer or saving, net of refunds, per month. */
  spending: Cents;
  /** Take-home minus spending, per month; can be negative. */
  kept: Cents;
  /** Net into savings accounts, plus retirement and investing, per month. */
  saved: Cents;
  /** Housing, utilities, insurance and loans, per month. */
  bills: Cents;
  subscriptionCost: Cents;
  /** Different subscription merchants paid in the period. */
  subscriptionCount: number;
  /** Days without day-to-day spending, per month. */
  noSpendDays: number;
  /** Lowest end-of-day total across checking accounts; null without one. */
  lowestBalance: Cents | null;
  /** Spending per category, per month, net of refunds. */
  byCategory: Partial<Record<SpendingKey, Cents>>;
};

export function spendingKeyOf(presetKey: PresetKey | null): SpendingKey | null {
  if (presetKey === null) return "uncategorized";
  switch (presetKey) {
    case "income":
    case "retirement":
    case "investing":
      return null;
    default:
      return presetKey;
  }
}

/**
 * `rows` may include rows outside the period; they are skipped.
 * `dataFrom` is the first day the person has data, so a workspace that
 * started last week isn't averaged over a whole year.
 * `checkingAtEnd` is the checking accounts' total balance at the end of
 * the period's last day.
 */
export function measure(
  rows: readonly MetricRow[],
  options: {
    period: Period;
    dataFrom: IsoDate | null;
    checkingAtEnd: Cents | null;
  },
): Measures | null {
  const { period, dataFrom, checkingAtEnd } = options;
  const days = coveredDays(period, dataFrom);
  if (days === 0) return null;
  const from = addDays(period.to, 1 - days);

  let takeHome = ZERO;
  let saved = ZERO;
  const byCategory = new Map<SpendingKey, Cents>();
  const subscriptions = new Set<string>();
  const spendingDays = new Set<IsoDate>();
  const checkingByDay = new Map<IsoDate, Cents>();

  for (const row of rows) {
    if (row.postedOn < from || row.postedOn > period.to) continue;
    if (row.accountType === "checking") {
      checkingByDay.set(
        row.postedOn,
        add(checkingByDay.get(row.postedOn) ?? ZERO, row.amount),
      );
    }
    if (row.presetKey !== null && SAVING_PRESETS.has(row.presetKey)) {
      // Money out of checking into an IRA or a brokerage (ADR-055).
      saved = add(saved, negate(row.amount));
      continue;
    }
    if (row.isTransfer) {
      // Your own money moving (ADR-020); only savings accounts' net counts.
      if (row.accountType === "savings") saved = add(saved, row.amount);
      continue;
    }
    const key = spendingKeyOf(row.presetKey);
    if (row.amount > 0 && (key === null || key === "uncategorized")) {
      takeHome = add(takeHome, row.amount);
      continue;
    }
    if (key === null) continue; // Money out categorized as income.
    // Money out adds to the category; a refund takes it back off.
    byCategory.set(key, subtract(byCategory.get(key) ?? ZERO, row.amount));
    if (row.amount < 0) {
      if (key === "subscriptions") subscriptions.add(row.merchant);
      if (key === "uncategorized" || !FIXED_PRESETS.has(key)) {
        spendingDays.add(row.postedOn);
      }
    }
  }

  const monthly = (total: Cents) => perMonth(total, days);
  const categories: Measures["byCategory"] = {};
  let spending = ZERO;
  for (const [key, total] of byCategory) {
    categories[key] = monthly(total);
    spending = add(spending, total);
  }
  let bills = ZERO;
  for (const key of BILL_PRESETS) {
    bills = add(bills, byCategory.get(key as SpendingKey) ?? ZERO);
  }

  return {
    coveredDays: days,
    takeHome: monthly(takeHome),
    spending: monthly(spending),
    kept: monthly(subtract(takeHome, spending)),
    saved: monthly(saved),
    bills: monthly(bills),
    subscriptionCost: monthly(byCategory.get("subscriptions") ?? ZERO),
    subscriptionCount: subscriptions.size,
    noSpendDays: countPerMonth(days - spendingDays.size, days),
    lowestBalance: lowestBalance(checkingAtEnd, checkingByDay, from, period.to),
    byCategory: categories,
  };
}

/** Walks back from the period's last day, undoing each day's rows. */
function lowestBalance(
  atEnd: Cents | null,
  byDay: ReadonlyMap<IsoDate, Cents>,
  from: IsoDate,
  to: IsoDate,
): Cents | null {
  if (atEnd === null) return null;
  let balance = atEnd;
  let lowest = atEnd;
  for (let day = to; day > from; day = addDays(day, -1)) {
    balance = subtract(balance, byDay.get(day) ?? ZERO);
    if (balance < lowest) lowest = balance;
  }
  return lowest;
}

/**
 * The checking total at the end of `to`, from each checking account's
 * current balance: rows after `to` (up to the balance's date) are undone.
 */
export function checkingBalanceAt(
  to: IsoDate,
  accounts: readonly { id: string; balance: Cents; asOf: IsoDate | null }[],
  rows: readonly { accountId: string; postedOn: IsoDate; amount: Cents }[],
): Cents | null {
  if (accounts.length === 0) return null;
  let total = ZERO;
  for (const account of accounts) {
    let balance = account.balance;
    for (const row of rows) {
      if (row.accountId !== account.id || row.postedOn <= to) continue;
      if (account.asOf !== null && row.postedOn > account.asOf) continue;
      balance = subtract(balance, row.amount);
    }
    total = add(total, balance);
  }
  return total;
}

// Stored form: one number per measure (ADR-056's `insight_sample` rows).

export type MeasureKey =
  | "covered_days"
  | "take_home"
  | "spending"
  | "kept"
  | "saved"
  | "bills"
  | "subscription_cost"
  | "subscription_count"
  | "no_spend_days"
  | "lowest_balance"
  | `category:${SpendingKey}`;

export type StoredMeasures = Partial<Record<MeasureKey, number>>;

export function toStored(m: Measures): StoredMeasures {
  const stored: StoredMeasures = {
    covered_days: m.coveredDays,
    take_home: m.takeHome,
    spending: m.spending,
    kept: m.kept,
    saved: m.saved,
    bills: m.bills,
    subscription_cost: m.subscriptionCost,
    subscription_count: m.subscriptionCount,
    no_spend_days: m.noSpendDays,
  };
  if (m.lowestBalance !== null) stored.lowest_balance = m.lowestBalance;
  for (const [key, value] of Object.entries(m.byCategory)) {
    stored[`category:${key as SpendingKey}`] = value;
  }
  return stored;
}

/** A stored money measure back as cents; zero when the person has none. */
export function storedCents(stored: StoredMeasures, key: MeasureKey): Cents {
  return cents(stored[key] ?? 0);
}
