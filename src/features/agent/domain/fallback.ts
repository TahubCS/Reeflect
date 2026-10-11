import { APP_NAME } from "@/config/app";
import { ACCOUNT_KINDS, type BudgetStanding, type Facts } from "./summary";
import { type Topic, topicOf } from "./topic";

// The reply built entirely by code (ADR-040): used when no model answers, or
// when a model's draft breaks the rules. It is written with the same labels
// a model would use, so both kinds of reply are filled the same way.

const NO_ACCOUNTS = `You're linked, but ${APP_NAME} has no accounts for you yet. Add one on the website and I can tell you how you're doing.`;

const AVERAGES =
  "Based on the last {days_covered} days, about {take_home} comes in and {spending} goes out a month.";

const QUIET =
  "There are no transactions in the last thirty days, so that is all I can say for now.";

const THIS_MONTH_ONLY = "I only have this month so far.";

function balances(facts: Facts): string {
  const owed = facts.owes ? " and owe {owed_total} on cards and loans" : "";
  return `You have {cash_total} in checking and savings${owed}.`;
}

function activity(facts: Facts): string {
  const { values } = facts;
  const parts = [AVERAGES];
  if (facts.gap === "kept") {
    parts.push("That leaves about {kept} a month.");
  } else if (facts.gap === "overspent") {
    parts.push("That is about {kept} a month more going out than coming in.");
  }
  if (values.top_category_1_name) {
    parts.push(
      "The most went to {top_category_1_name} ({top_category_1_amount}).",
    );
  }
  return parts.join(" ");
}

/** The calendar's headline in a sentence (ADR-042), or null without a payday. */
function untilPayday(facts: Facts): string | null {
  if (facts.payday !== "per_day" && facts.payday !== "all_used") return null;
  const due = facts.values.due_before_payday
    ? "{due_before_payday} is due"
    : "Nothing is due";
  const upTo = `${due} before your next payday on {payday_date}, {days_until_payday} away`;
  return facts.payday === "per_day"
    ? `${upTo}. That leaves {per_day} a day until then.`
    : `${upTo}, which will use all of today's balance.`;
}

/** Where a per-day figure comes from, for someone with no payday confirmed. */
function confirmPayday(facts: Facts): string {
  const waiting = facts.values.suggestions_waiting
    ? " It has {suggestions_waiting} to review."
    : "";
  return `Confirm your payday on the website's Recurring payments page and I can tell you what you can spend a day.${waiting}`;
}

/** "a", "a and b", "a, b and c". */
function listed(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * Where a category stands against its budget, in a sentence of its own.
 * Stated the same plain way whether money is left or not (ADR-042). Each
 * says "this month", as `completeDraft` asks of these figures.
 */
function budgetLine(
  standing: BudgetStanding,
  label: string,
  budgetAsked: boolean,
): string | null {
  const budget = `{${label}_budget} {${label}_name} budget this month`;
  if (standing === "left") {
    return `You have {${label}_left} left of your ${budget}.`;
  }
  if (standing === "used") return `That is all of your ${budget}.`;
  if (standing === "over") {
    return `That is {${label}_over} over your ${budget}.`;
  }
  return budgetAsked
    ? `There is no {${label}_name} budget set for this month.`
    : null;
}

/** What was spent on the categories asked about, and their budgets (F-28). */
function categoriesReply(
  facts: Facts,
  topic: Extract<Topic, { type: "categories" }>,
): string {
  const spent = topic.picked.map(
    (n) => `{category_${n}_spent} on {category_${n}_name}`,
  );
  const lines = topic.picked.flatMap((n) => {
    const line = budgetLine(
      facts.categories[n - 1]!.budget,
      `category_${n}`,
      topic.budgetAsked,
    );
    return line === null ? [] : [line];
  });
  return [
    ...(topic.otherPeriod ? [THIS_MONTH_ONLY] : []),
    `You've spent ${listed(spent)} so far this month.`,
    ...lines,
  ].join(" ");
}

/** The next payments before payday, soonest first (F-28). */
function paymentsReply(facts: Facts): string {
  if (facts.payday !== "per_day" && facts.payday !== "all_used") {
    return confirmPayday(facts);
  }
  const { values } = facts;
  const shown = ([1, 2, 3] as const).filter(
    (n) => values[`due_${n}_name`] !== undefined,
  );
  if (shown.length === 0) {
    return values.due_before_payday
      ? "{due_before_payday} is due before your next payday on {payday_date}."
      : "Nothing is due before your next payday on {payday_date}.";
  }
  // A written-out date has a comma in it, so each item ends with one.
  const items = shown.map(
    (n, index) =>
      `{due_${n}_name} ({due_${n}_amount}) ${index === 0 ? "is due" : "on"} {due_${n}_date}`,
  );
  // Three at most are named; a lone one is the only one.
  if (items.length === 1) {
    return `${items[0]}. Nothing else is due before your next payday.`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}. {due_before_payday} is due in all before your next payday.`;
}

/** Each account asked about: what is in it, or what is owed on it (F-28). */
function accountsReply(facts: Facts, picked: number[]): string {
  return picked
    .map((n) => {
      const { kind } = facts.accounts[n - 1]!;
      const account = `${ACCOUNT_KINDS[kind]}, {account_${n}_name}`;
      return kind === "credit_card" || kind === "loan"
        ? `You owe {account_${n}_balance} on your ${account}.`
        : `Your ${account}, has {account_${n}_balance}.`;
    })
    .join(" ");
}

/**
 * A draft in label form, for `fill` to complete. With the person's text it
 * answers what they asked about, as far as the words say (`topicOf`);
 * without it, or when nothing is recognised, it is the general summary.
 */
export function fallbackDraft(facts: Facts, text?: string): string {
  if (facts.state === "no_accounts") return NO_ACCOUNTS;

  const topic = text === undefined ? null : topicOf(text, facts);
  if (topic?.type === "categories") return categoriesReply(facts, topic);
  if (topic?.type === "payments") return paymentsReply(facts);
  if (topic?.type === "accounts") return accountsReply(facts, topic.picked);

  const payday = untilPayday(facts);
  if (payday !== null) {
    // The headline first; the averages stay short behind it.
    const averages = facts.state === "ready" ? ` ${AVERAGES}` : "";
    return `${balances(facts)} ${payday}${averages}`;
  }
  const rest = facts.state === "ready" ? activity(facts) : QUIET;
  return `${balances(facts)} ${rest} ${confirmPayday(facts)}`;
}
