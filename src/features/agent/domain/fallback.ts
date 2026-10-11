import { APP_NAME } from "@/config/app";
import type { Facts } from "./summary";

// The reply built entirely by code (ADR-040): used when no model answers, or
// when a model's draft breaks the rules. It is written with the same labels
// a model would use, so both kinds of reply are filled the same way.

const NO_ACCOUNTS = `You're linked, but ${APP_NAME} has no accounts for you yet. Add one on the website and I can tell you how you're doing.`;

const AVERAGES =
  "Based on the last {days_covered} days, about {take_home} comes in and {spending} goes out a month.";

const QUIET =
  "There are no transactions in the last thirty days, so that is all I can say for now.";

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

/** A draft in label form, for `fill` to complete. */
export function fallbackDraft(facts: Facts): string {
  if (facts.state === "no_accounts") return NO_ACCOUNTS;

  const payday = untilPayday(facts);
  if (payday !== null) {
    // The headline first; the averages stay short behind it.
    const averages = facts.state === "ready" ? ` ${AVERAGES}` : "";
    return `${balances(facts)} ${payday}${averages}`;
  }
  const rest = facts.state === "ready" ? activity(facts) : QUIET;
  return `${balances(facts)} ${rest} ${confirmPayday(facts)}`;
}
