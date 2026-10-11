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
// (F-25). Code works every figure out here and formats it; the model is
// only ever given the label names (ADR-019).

/** How much the agent has to go on. */
export type FactsState = "no_accounts" | "no_activity" | "ready";

export type Facts = {
  state: FactsState;
  /** Label → the text that replaces it, e.g. `cash_total` → "$1,204.99". */
  values: Partial<Record<Label, string>>;
  /** Whether they owe anything on a card or loan. */
  owes: boolean;
  /**
   * Which way the gap between money in and money out goes. `{kept}` is
   * always a positive amount; this says what it means. Null without
   * activity.
   */
  gap: "kept" | "overspent" | "even" | null;
};

/** Every label the agent can fill, with what it stands for. */
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

export type FactsInput = {
  accounts: readonly { type: AccountKind; balance: Cents }[];
  /** The last 30 days' measures, or null when there is nothing to measure. */
  measures: Measures | null;
  /** Category preset key → the name the person sees. */
  categoryNames: Readonly<Record<string, string>>;
};

const TOP_CATEGORIES = 3;
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

export function buildFacts(input: FactsInput): Facts {
  const { accounts, measures } = input;
  if (accounts.length === 0) {
    return { state: "no_accounts", values: {}, owes: false, gap: null };
  }

  const values: Facts["values"] = {};
  const { cash, owed } = balances(accounts);
  const owes = owed > 0;
  values.cash_total = formatCents(cash);
  if (owes) values.owed_total = formatCents(owed);

  if (measures === null) {
    return { state: "no_activity", values, owes, gap: null };
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
    // The noun goes in with the count, so the model cannot get the plural wrong.
    values.subscription_count =
      measures.subscriptionCount === 1
        ? "1 subscription"
        : `${measures.subscriptionCount} subscriptions`;
  }
  topCategories(measures, input.categoryNames).forEach((category, index) => {
    const rank = (index + 1) as 1 | 2 | 3;
    values[`top_category_${rank}_name`] = category.name;
    values[`top_category_${rank}_amount`] = formatCents(category.amount);
  });

  return { state: "ready", values, owes, gap };
}
