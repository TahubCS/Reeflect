import {
  type Cents,
  ZERO,
  absolute,
  add,
  divideFloor,
  positivePart,
  sum,
  times,
} from "@/lib/money";
import {
  type IsoDate,
  type YearMonth,
  addMonths,
  daysBetween,
  daysInMonth,
  monthOf,
  monthPrefix,
  monthsApart,
  parseIso,
  toIso,
  weekdayOf,
} from "./dates";

// Amounts are signed: positive is money in, negative is money out.

export type Kind = "income" | "bill" | "subscription" | "everyday";

/** How an entry reached the app: synced from the bank, typed in, or texted to the agent. */
export type Source = "bank" | "manual" | "text";

/** Something that happened, or a one-off the person planned for a later day. */
export type Entry = {
  id: string;
  date: IsoDate;
  name: string;
  amount: Cents;
  kind: Kind;
  category: string;
  source: Source;
  /** The account's nickname, when the workspace has more than one account. */
  accountName?: string;
  /**
   * True for a credit-card row: it is spending, but it does not move the
   * balance line, which is checking plus savings (ADR-024).
   */
  onCard?: boolean;
  /** True for a row typed by hand, which the day panel may remove (ADR-050). */
  removable?: boolean;
};

/** Something that repeats on the same day every month. */
export type Recurring = {
  id: string;
  name: string;
  amount: Cents;
  kind: Exclude<Kind, "everyday">;
  category: string;
  day: number;
};

export type CashflowData = {
  /** First month with data; the opening balance is the balance as that month starts. */
  start: YearMonth;
  openingBalance: Cents;
  entries: Entry[];
  recurring: Recurring[];
};

export type Item = Omit<Entry, "source"> & {
  /** Missing for a repeating item that has not happened yet */
  source?: Source;
  /** True for anything after today: it is expected, not yet real. */
  planned: boolean;
  recurringId?: string;
};

export type DayView = {
  date: IsoDate;
  day: number;
  isToday: boolean;
  isFuture: boolean;
  items: Item[];
  moneyIn: Cents;
  moneyOut: Cents;
  /** Day-to-day spending only, without bills and subscriptions */
  everydaySpent: Cents;
  endBalance: Cents;
  /** A day that has passed with nothing going out at all */
  noSpend: boolean;
};

export type MonthView = {
  month: YearMonth;
  /** Empty cells before the 1st, for a Sunday-first grid */
  leadingBlanks: number;
  days: DayView[];
  largestEverydaySpend: Cents;
};

const amounts = (items: readonly { amount: Cents }[]) =>
  sum(items.map((item) => item.amount));

/** What moves the balance line: everything except card rows. */
const balanceChange = (items: readonly Item[]) =>
  amounts(items.filter((item) => !item.onCard));

/** Real entries for the month, plus each repeating item that has not happened yet. */
function monthItems(
  data: CashflowData,
  month: YearMonth,
  today: IsoDate,
): Item[] {
  const prefix = monthPrefix(month);
  const lastDay = daysInMonth(month);
  const real = data.entries
    .filter((entry) => entry.date.startsWith(prefix))
    .map((entry): Item => ({ ...entry, planned: entry.date > today }));
  const expected = data.recurring
    .map((rule): Item => ({
      id: `${rule.id}@${prefix}`,
      date: toIso(month.year, month.month, Math.min(rule.day, lastDay)),
      name: rule.name,
      amount: rule.amount,
      kind: rule.kind,
      category: rule.category,
      planned: true,
      recurringId: rule.id,
    }))
    .filter((item) => item.date > today);
  return [...real, ...expected];
}

function balanceBefore(
  data: CashflowData,
  month: YearMonth,
  today: IsoDate,
): Cents {
  let balance = data.openingBalance;
  for (let i = 0; i < monthsApart(data.start, month); i += 1) {
    balance = add(
      balance,
      balanceChange(monthItems(data, addMonths(data.start, i), today)),
    );
  }
  return balance;
}

export function buildMonth(
  data: CashflowData,
  month: YearMonth,
  today: IsoDate,
): MonthView {
  const items = monthItems(data, month, today);
  let balance = balanceBefore(data, month, today);
  let largestEverydaySpend = ZERO;

  const days = Array.from(
    { length: daysInMonth(month) },
    (_, index): DayView => {
      const date = toIso(month.year, month.month, index + 1);
      const dayItems = items.filter((item) => item.date === date);
      const everydaySpent = absolute(
        amounts(
          dayItems.filter(
            (item) => item.kind === "everyday" && item.amount < 0,
          ),
        ),
      );
      const moneyOut = absolute(
        amounts(dayItems.filter((item) => item.amount < 0)),
      );
      if (everydaySpent > largestEverydaySpend)
        largestEverydaySpend = everydaySpent;
      balance = add(balance, balanceChange(dayItems));
      return {
        date,
        day: index + 1,
        isToday: date === today,
        isFuture: date > today,
        items: dayItems,
        moneyIn: amounts(dayItems.filter((item) => item.amount > 0)),
        moneyOut,
        everydaySpent,
        endBalance: balance,
        noSpend: date < today && moneyOut === 0,
      };
    },
  );

  return {
    month,
    leadingBlanks: weekdayOf(toIso(month.year, month.month, 1)),
    days,
    largestEverydaySpend,
  };
}

export type Summary = {
  balanceToday: Cents;
  /** Null when no income is expected in the next two months */
  payday: { date: IsoDate; daysAway: number } | null;
  /** Bills and subscriptions due before payday */
  dueBeforePayday: Item[];
  dueTotal: Cents;
  /** What is left of today's balance once those are paid */
  freeToSpend: Cents;
  perDay: Cents;
  monthIn: Cents;
  monthOut: Cents;
  biggestCategory: { name: string; total: Cents; count: number } | null;
  noSpendDays: number;
};

export function summarize(data: CashflowData, today: IsoDate): Summary {
  const thisMonth = monthOf(today);
  const current = buildMonth(data, thisMonth, today);
  const todayView = current.days[parseIso(today).day - 1];
  const balanceToday = todayView.endBalance;

  const upcoming = [
    ...monthItems(data, thisMonth, today),
    ...monthItems(data, addMonths(thisMonth, 1), today),
  ]
    // A card row is neither a payday nor paid out of today's balance.
    .filter((item) => item.date > today && !item.onCard)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextIncome = upcoming.find((item) => item.amount > 0);
  const dueBeforePayday = upcoming.filter(
    (item) => item.amount < 0 && (!nextIncome || item.date < nextIncome.date),
  );
  const dueTotal = absolute(amounts(dueBeforePayday));
  const freeToSpend = positivePart(add(balanceToday, amounts(dueBeforePayday)));
  const daysAway = nextIncome
    ? Math.max(1, daysBetween(today, nextIncome.date))
    : 0;

  const soFar = current.days.filter((day) => !day.isFuture);
  const byCategory = new Map<string, { total: Cents; count: number }>();
  for (const item of soFar.flatMap((day) => day.items)) {
    if (item.kind !== "everyday" || item.amount >= 0) continue;
    const seen = byCategory.get(item.category) ?? { total: ZERO, count: 0 };
    byCategory.set(item.category, {
      total: add(seen.total, absolute(item.amount)),
      count: seen.count + 1,
    });
  }
  const biggest = [...byCategory.entries()].sort(
    (a, b) => b[1].total - a[1].total,
  )[0];

  return {
    balanceToday,
    payday: nextIncome ? { date: nextIncome.date, daysAway } : null,
    dueBeforePayday,
    dueTotal,
    freeToSpend,
    perDay: nextIncome ? divideFloor(freeToSpend, daysAway) : ZERO,
    monthIn: sum(soFar.map((day) => day.moneyIn)),
    monthOut: sum(soFar.map((day) => day.moneyOut)),
    biggestCategory: biggest ? { name: biggest[0], ...biggest[1] } : null,
    noSpendDays: current.days.filter((day) => day.noSpend).length,
  };
}

/** How many of this month's entries came from each source. */
export function sourceCounts(
  data: CashflowData,
  today: IsoDate,
): Record<Source, number> {
  const prefix = monthPrefix(monthOf(today));
  const counts: Record<Source, number> = { bank: 0, manual: 0, text: 0 };
  for (const entry of data.entries) {
    if (entry.date.startsWith(prefix)) counts[entry.source] += 1;
  }
  return counts;
}

export type SubscriptionCosts = {
  count: number;
  monthly: Cents;
  yearly: Cents;
  markedCount: number;
  /** A year of the subscriptions marked "planning to cancel" */
  yearlySavingIfCancelled: Cents;
};

export function subscriptionCosts(
  data: CashflowData,
  cancelPlans: ReadonlySet<string>,
): SubscriptionCosts {
  const subscriptions = data.recurring.filter(
    (rule) => rule.kind === "subscription",
  );
  const marked = subscriptions.filter((rule) => cancelPlans.has(rule.id));
  const monthly = absolute(amounts(subscriptions));
  return {
    count: subscriptions.length,
    monthly,
    yearly: times(monthly, 12),
    markedCount: marked.length,
    yearlySavingIfCancelled: times(absolute(amounts(marked)), 12),
  };
}
