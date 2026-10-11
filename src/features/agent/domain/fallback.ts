import { APP_NAME } from "@/config/app";
import type { Facts } from "./summary";

// The reply built entirely by code (ADR-040): used when no model answers, or
// when a model's draft breaks the rules. It is written with the same labels
// a model would use, so both kinds of reply are filled the same way.

const NO_ACCOUNTS = `You're linked, but ${APP_NAME} has no accounts for you yet. Add one on the website and I can tell you how you're doing.`;

function balances(facts: Facts): string {
  const owed = facts.owes ? " and owe {owed_total} on cards and loans" : "";
  return `You have {cash_total} in checking and savings${owed}.`;
}

function activity(facts: Facts): string {
  const { values } = facts;
  const parts = [
    "Based on the last {days_covered} days, about {take_home} comes in and {spending} goes out a month.",
  ];
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

/** A draft in label form, for `fill` to complete. */
export function fallbackDraft(facts: Facts): string {
  switch (facts.state) {
    case "no_accounts":
      return NO_ACCOUNTS;
    case "no_activity":
      return `${balances(facts)} There are no transactions in the last thirty days, so that is all I can say for now.`;
    case "ready":
      return `${balances(facts)} ${activity(facts)}`;
  }
}
