import type { Facts } from "@/features/agent/client";
import { MAX_SUGGESTIONS, type Panel } from "./panel";

// The panel built entirely by code (ADR-045): what the dashboard shows
// before anyone asks a model, and when no model answers or its draft breaks
// the rules. Written with the same labels a model would use, so both are
// checked and filled the same way.

function balances(facts: Facts): string {
  const owed = facts.owes ? " and owe {owed_total} on cards and loans" : "";
  return `You have {cash_total} in checking and savings${owed}.`;
}

/** The calendar's headline in a sentence, or null without a payday. */
function untilPayday(facts: Facts): string | null {
  if (facts.payday !== "per_day" && facts.payday !== "all_used") return null;
  const due = facts.values.due_before_payday
    ? "{due_before_payday} is due"
    : "Nothing is due";
  const upTo = `${due} before your next payday on {payday_date}, {days_until_payday} away`;
  return facts.payday === "per_day"
    ? `${upTo}, which leaves {per_day} a day until then.`
    : `${upTo}, which will use all of today's balance.`;
}

function averages(facts: Facts): string {
  const gap =
    facts.gap === "kept"
      ? " That leaves about {kept} a month."
      : facts.gap === "overspent"
        ? " That is about {kept} a month more going out than coming in."
        : "";
  return `Based on the last {days_covered} days, about {take_home} comes in and {spending} goes out a month.${gap}`;
}

function summary(facts: Facts): string {
  const payday = untilPayday(facts);
  return [
    balances(facts),
    ...(payday === null ? [] : [payday]),
    facts.state === "ready"
      ? averages(facts)
      : "There are no transactions in the last thirty days yet.",
    ...(facts.values.month_spent
      ? ["You have spent {month_spent} so far this month."]
      : []),
  ].join(" ");
}

/** The first category past its budget, largest spending first. */
function overBudget(facts: Facts): string | null {
  const index = facts.categories.findIndex(({ budget }) => budget === "over");
  if (index === -1) return null;
  const label = `category_${index + 1}`;
  return `{${label}_name} is {${label}_over} past its budget this month. The Budgets page shows every category.`;
}

/** What code can point at, most useful first. */
function suggestions(facts: Facts): string[] {
  const { values } = facts;
  const found: string[] = [];
  if (facts.payday === "none") {
    const waiting = values.suggestions_waiting
      ? " It has {suggestions_waiting} to review."
      : "";
    found.push(
      `Confirm your payday on the Recurring payments page to see what you can spend each day.${waiting}`,
    );
  }
  const over = overBudget(facts);
  if (over !== null) found.push(over);
  if (values.subscription_yearly) {
    found.push(
      "You pay for {subscription_count}, which comes to about {subscription_yearly} a year. The Recurring payments page lists each one.",
    );
  }
  if (values.top_category_1_name) {
    found.push(
      "The most goes to {top_category_1_name}, about {top_category_1_amount} a month.",
    );
  }
  if (facts.state === "no_activity") {
    found.push(
      "Import a statement or add a transaction to see where your money goes.",
    );
  }
  return found.slice(0, MAX_SUGGESTIONS);
}

/**
 * The panel in label form, for the same check and fill as a model's draft.
 * Null without accounts: the dashboard has its own empty state then.
 */
export function fallbackPanel(facts: Facts): Panel | null {
  if (facts.state === "no_accounts") return null;
  return { summary: summary(facts), suggestions: suggestions(facts) };
}
