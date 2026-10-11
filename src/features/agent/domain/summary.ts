import type { AccountKind, Measures } from "@/features/insights";
import {
  type Cents,
  ZERO,
  absolute,
  add,
  formatCents,
  negate,
} from "@/lib/money";

// What the agent knows about one person when they ask how they are doing
// (F-25) or about a category, a budget, a bill or an account (F-28). Code
// works every figure out here and formats it; the model is only ever given
// the label names (ADR-019).

/** How much the agent has to go on. */
export type FactsState = "no_accounts" | "no_activity" | "ready";

/** A label whose meaning is written for this workspace, with its value. */
export type Described = { value: string; description: string };

/** Where a category stands against its budget this month. */
export type BudgetStanding = "none" | "left" | "used" | "over";

export type Facts = {
  state: FactsState;
  /** Label → the text that replaces it, e.g. `cash_total` → "$1,204.99". */
  values: Partial<Record<Label, string>>;
  /**
   * The labels that differ from one workspace to the next (F-28):
   * `category_N_…` for this month's categories and `account_N_…` for the
   * accounts. Each carries its own description, since it names a category
   * or says what kind of account it is.
   */
  described: Record<string, Described>;
  /** This month's categories, in label order: the first is `category_1_…`. */
  categories: readonly { name: string; budget: BudgetStanding }[];
  /** The accounts, in label order: the first is `account_1_…`. */
  accounts: readonly { name: string; kind: AccountKind }[];
  /** Whether they owe anything on a card or loan. */
  owes: boolean;
  /**
   * Which way the gap between money in and money out goes. `{kept}` is
   * always a positive amount; this says what it means. Null without
   * activity.
   */
  gap: "kept" | "overspent" | "even" | null;
  /**
   * What the calendar's headline says (ADR-042), so the reply says the
   * same: a per-day amount until payday, bills that use all of today's
   * balance, or no confirmed payday yet. Null without accounts.
   */
  payday: "per_day" | "all_used" | "none" | null;
};

/** Every label the agent can fill for any workspace, with what it stands for. */
export const LABELS = {
  cash_total: "the total in their checking and savings accounts right now",
  owed_total: "the total they owe on credit cards and loans right now",
  days_covered:
    "how many recent days the monthly averages are worked out from; use it only as 'based on the last {days_covered} days'",
  take_home: "about how much comes in a month (a monthly average)",
  spending: "about how much goes out a month (a monthly average)",
  kept: "about how far apart money in and money out are a month (a monthly average)",
  saved:
    "about how much goes into savings, retirement or investing a month (a monthly average)",
  bills:
    "about what housing, utilities, insurance and loan payments cost a month (a monthly average)",
  subscription_cost:
    "about what their subscriptions cost a month (a monthly average)",
  subscription_count:
    "how many different subscriptions they paid; the value already includes the word, so write the label alone, as in 'you pay for {subscription_count}'",
  payday_date:
    "the date of their next confirmed payday, written out; use it as 'your next payday on {payday_date}'",
  days_until_payday:
    "how long until that payday; the value already includes the word, so write the label alone, as in 'that is {days_until_payday} away'",
  due_before_payday:
    "the exact total of the bills and subscriptions due before that payday",
  due_count:
    "how many payments are due before that payday; the value already includes the word, so write the label alone, as in '{due_count} before then'",
  due_1_name: "the name of the next payment due before that payday",
  due_1_amount: "exactly how much that next payment is",
  due_1_date:
    "the date that next payment is due, written out; use it as 'due {due_1_date}'",
  due_2_name: "the name of the second payment due before that payday",
  due_2_amount: "exactly how much that second payment is",
  due_2_date: "the date that second payment is due, written out",
  due_3_name: "the name of the third payment due before that payday",
  due_3_amount: "exactly how much that third payment is",
  due_3_date: "the date that third payment is due, written out",
  free_to_spend:
    "exactly what is left of today's balance after what is due before that payday",
  per_day:
    "exactly what they can spend a day until that payday, as on the website's calendar; use it as '{per_day} a day until payday'",
  suggestions_waiting:
    "how many recurring payments the website found and is waiting for them to confirm; the value already includes the words, so write the label alone, as in '{suggestions_waiting} to review'",
  month_spent:
    "exactly what they have spent in total so far this month, as on the website's Budgets page",
  top_category_1_name: "the category they spent the most on",
  top_category_1_amount:
    "about what they spend in that category a month (a monthly average)",
  top_category_2_name: "the category they spent the second most on",
  top_category_2_amount:
    "about what they spend in that category a month (a monthly average)",
  top_category_3_name: "the category they spent the third most on",
  top_category_3_amount:
    "about what they spend in that category a month (a monthly average)",
} as const satisfies Record<string, string>;

export type Label = keyof typeof LABELS;

/**
 * Labels whose value is a monthly average, not a total: the last thirty
 * days scaled to an average month, as on the Insights page (ADR-056). A
 * reply that uses one must say it is "a month" (see `completeDraft`).
 */
export const MONTHLY_LABELS: ReadonlySet<Label> = new Set<Label>([
  "take_home",
  "spending",
  "kept",
  "saved",
  "bills",
  "subscription_cost",
  "top_category_1_amount",
  "top_category_2_amount",
  "top_category_3_amount",
]);

/**
 * Whether a label is a figure for this month so far (the Budgets page's
 * own, F-28), not an average. A reply that uses one must say "this month"
 * (see `completeDraft`).
 */
export function isMonthToDate(label: string): boolean {
  return (
    label === "month_spent" ||
    /^category_[0-9]+_(spent|budget|left|over)$/.test(label)
  );
}

/** Every label's value, fixed and described alike, for `fill`. */
export function valuesOf(facts: Facts): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [label, value] of Object.entries(facts.values)) {
    if (value !== undefined) values[label] = value;
  }
  for (const [label, { value }] of Object.entries(facts.described)) {
    values[label] = value;
  }
  return values;
}

/**
 * The calendar's own figures for today (`summarize` in the cashflow
 * feature), so a reply and the website's headline cannot disagree.
 */
export type CalendarFigures = {
  /** The next confirmed payday, or null when none is confirmed. */
  payday: { writtenOut: string; daysAway: number } | null;
  dueTotal: Cents;
  dueCount: number;
  /**
   * What is due before that payday, soonest first, each amount signed as
   * the calendar has it (money out is negative).
   */
  upcoming: readonly { name: string; writtenOut: string; amount: Cents }[];
  freeToSpend: Cents;
  perDay: Cents;
  /** Recurring payments found and not yet confirmed (ADR-058). */
  suggestions: number;
};

/**
 * This month so far, as the Budgets page reads it (`readBudgetMonth`), so a
 * reply and that page cannot disagree.
 */
export type MonthFigures = {
  totalSpending: Cents;
  categories: readonly {
    name: string;
    spent: Cents;
    /** The budget set for this month, or null. */
    allocation: Cents | null;
    /** The budget less what was spent; negative when over. Null without one. */
    remaining: Cents | null;
  }[];
};

export type FactsInput = {
  /** In the stored order. A nickname is only ever a label's value. */
  accounts: readonly { type: AccountKind; nickname: string; balance: Cents }[];
  calendar: CalendarFigures;
  /** Left out when this month could not be read; so are its labels then. */
  month?: MonthFigures;
  /** The last 30 days' measures, or null when there is nothing to measure. */
  measures: Measures | null;
  /** Category preset key → the name the person sees. */
  categoryNames: Readonly<Record<string, string>>;
};

const TOP_CATEGORIES = 3;
const MONTH_CATEGORIES = 12;
const UPCOMING_PAYMENTS = 3;
const ACCOUNTS = 6;
const UNCATEGORIZED_NAME = "Uncategorized";

const owes = (type: AccountKind) => type === "credit_card" || type === "loan";

function balances(accounts: FactsInput["accounts"]) {
  let cash = ZERO;
  let owed = ZERO;
  for (const account of accounts) {
    if (!owes(account.type)) cash = add(cash, account.balance);
    // A card or loan balance is negative when money is owed (ADR-008).
    else if (account.balance < 0) owed = add(owed, negate(account.balance));
  }
  return { cash, owed };
}

function topCategories(
  measures: Measures,
  names: FactsInput["categoryNames"],
): { name: string; amount: Cents }[] {
  return Object.entries(measures.byCategory)
    .filter((entry): entry is [string, Cents] => (entry[1] ?? 0) > 0)
    .sort(([aKey, a], [bKey, b]) => b - a || aKey.localeCompare(bKey))
    .slice(0, TOP_CATEGORIES)
    .map(([key, amount]) => ({
      name: key === "uncategorized" ? UNCATEGORIZED_NAME : (names[key] ?? key),
      amount,
    }));
}

/** A count with its noun, so the model cannot get the plural wrong. */
const counted = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

/** Adds the calendar's labels and says which headline the website shows. */
function paydayFacts(
  calendar: CalendarFigures,
  values: Facts["values"],
): NonNullable<Facts["payday"]> {
  const { payday } = calendar;
  if (payday === null) {
    if (calendar.suggestions > 0) {
      values.suggestions_waiting = counted(
        calendar.suggestions,
        "recurring payment",
        "recurring payments",
      );
    }
    return "none";
  }

  values.payday_date = payday.writtenOut;
  values.days_until_payday = counted(payday.daysAway, "day", "days");
  if (calendar.dueTotal > 0) {
    values.due_before_payday = formatCents(calendar.dueTotal);
    values.due_count = counted(calendar.dueCount, "payment", "payments");
  }
  calendar.upcoming.slice(0, UPCOMING_PAYMENTS).forEach((payment, index) => {
    const rank = (index + 1) as 1 | 2 | 3;
    values[`due_${rank}_name`] = payment.name;
    values[`due_${rank}_amount`] = formatCents(absolute(payment.amount));
    values[`due_${rank}_date`] = payment.writtenOut;
  });
  // The same test the calendar's headline uses.
  if (calendar.freeToSpend <= 0) return "all_used";
  values.free_to_spend = formatCents(calendar.freeToSpend);
  values.per_day = formatCents(calendar.perDay);
  return "per_day";
}

/**
 * A category's name as the model may read it. A name holding a digit or a
 * brace is not sent, so the request never carries a digit (ADR-019) and a
 * name cannot pass for a label; the model is pointed at the name's label.
 */
const said = (name: string, label: string) =>
  /[\p{Nd}{}]/u.test(name) ? `the category {${label}}` : name;

/**
 * This month's categories (F-28): those with spending or a budget, largest
 * spending first. Their labels go into `described`.
 */
function monthFacts(
  month: MonthFigures,
  described: Facts["described"],
): Facts["categories"] {
  return month.categories
    .filter((category) => category.spent > 0 || category.allocation !== null)
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name))
    .slice(0, MONTH_CATEGORIES)
    .map(({ name, spent, allocation, remaining }, index) => {
      const label = `category_${index + 1}`;
      const named = said(name, `${label}_name`);
      const standing = (budget: BudgetStanding) => ({ name, budget });
      described[`${label}_name`] = {
        value: name,
        description: `one of their spending categories: ${named}`,
      };
      described[`${label}_spent`] = {
        value: formatCents(spent),
        description: `exactly what they spent on ${named} so far this month`,
      };
      if (allocation === null || remaining === null) return standing("none");
      described[`${label}_budget`] = {
        value: formatCents(allocation),
        description: `their budget for ${named} this month`,
      };
      if (remaining === 0) return standing("used");
      if (remaining > 0) {
        described[`${label}_left`] = {
          value: formatCents(remaining),
          description: `exactly what is left of their ${named} budget this month`,
        };
        return standing("left");
      }
      described[`${label}_over`] = {
        value: formatCents(negate(remaining)),
        description: `exactly how far past their ${named} budget they are this month`,
      };
      return standing("over");
    });
}

/** What kind of account it is, in words. The model is told only this. */
export const ACCOUNT_KINDS = {
  checking: "checking account",
  savings: "savings account",
  credit_card: "credit card",
  loan: "loan",
} as const satisfies Record<AccountKind, string>;

/**
 * Each account's name and balance (F-28). The description says only what
 * kind of account it is; the nickname is the label's value, which code
 * fills in.
 */
function accountFacts(
  accounts: FactsInput["accounts"],
  described: Facts["described"],
): Facts["accounts"] {
  return accounts.slice(0, ACCOUNTS).map((account, index) => {
    const label = `account_${index + 1}`;
    const kind = ACCOUNT_KINDS[account.type];
    described[`${label}_name`] = {
      value: account.nickname,
      description: `the name they gave a ${kind} of theirs`,
    };
    described[`${label}_balance`] = owes(account.type)
      ? {
          // What is owed, as a positive amount; nothing when it is in credit.
          value: formatCents(
            account.balance < 0 ? negate(account.balance) : ZERO,
          ),
          description: `a ${kind}: exactly what they owe on {${label}_name} right now`,
        }
      : {
          value: formatCents(account.balance),
          description: `their ${kind} {${label}_name}: exactly what is in it right now`,
        };
    return { name: account.nickname, kind: account.type };
  });
}

export function buildFacts(input: FactsInput): Facts {
  const { accounts, measures, month } = input;
  if (accounts.length === 0) {
    return {
      state: "no_accounts",
      values: {},
      described: {},
      categories: [],
      accounts: [],
      owes: false,
      gap: null,
      payday: null,
    };
  }

  const values: Facts["values"] = {};
  const described: Facts["described"] = {};
  const { cash, owed } = balances(accounts);
  const owes = owed > 0;
  values.cash_total = formatCents(cash);
  if (owes) values.owed_total = formatCents(owed);
  const payday = paydayFacts(input.calendar, values);
  if (month && month.totalSpending > 0) {
    values.month_spent = formatCents(month.totalSpending);
  }
  const asked = {
    described,
    categories: month ? monthFacts(month, described) : [],
    accounts: accountFacts(accounts, described),
  };

  if (measures === null) {
    return { state: "no_activity", values, ...asked, owes, gap: null, payday };
  }

  values.days_covered = String(measures.coveredDays);
  values.take_home = formatCents(measures.takeHome);
  values.spending = formatCents(measures.spending);
  const gap =
    measures.kept > 0 ? "kept" : measures.kept < 0 ? "overspent" : "even";
  if (gap !== "even") values.kept = formatCents(absolute(measures.kept));
  if (measures.saved > 0) values.saved = formatCents(measures.saved);
  if (measures.bills > 0) values.bills = formatCents(measures.bills);
  if (measures.subscriptionCount > 0) {
    values.subscription_cost = formatCents(measures.subscriptionCost);
    values.subscription_count = counted(
      measures.subscriptionCount,
      "subscription",
      "subscriptions",
    );
  }
  topCategories(measures, input.categoryNames).forEach((category, index) => {
    const rank = (index + 1) as 1 | 2 | 3;
    values[`top_category_${rank}_name`] = category.name;
    values[`top_category_${rank}_amount`] = formatCents(category.amount);
  });

  return { state: "ready", values, ...asked, owes, gap, payday };
}
