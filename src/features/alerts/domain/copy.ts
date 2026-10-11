import { APP_NAME } from "@/config/app";

// The words of proactive texts (F-22, F-26, ADR-038, ADR-105). Fixed copy
// written by code, never by a model. A proactive text never carries an
// amount: the lock screen may show it. The user replies DETAILS for the
// amounts, which then come as an answer to their own request.

/**
 * A name as the user saved it, unless it holds a digit or a currency sign
 * ("Gym $30"), which could put an amount on the lock screen. Then the
 * generic word is used instead.
 */
export function safeName(name: string, fallback: string): string {
  const trimmed = name.trim();
  return trimmed === "" || /[\d$¢€£]/.test(trimmed) ? fallback : trimmed;
}

/** A subscription that was just found and is not confirmed yet (F-26). */
export function subscriptionAlertText(name: string): string {
  const what = safeName(name, "a payment");
  return `${APP_NAME} found what looks like a new subscription: ${what}. Reply KEEP if you're keeping it, CANCEL if you plan to cancel it yourself, or IGNORE if it isn't a subscription. Reply DETAILS to see what it costs.`;
}

export type BillReminder = {
  name: string;
  /** "today", "tomorrow", or "on Monday, October 15". Never an amount. */
  when: string;
  autopay: boolean;
};

/** A bill due within the week (F-22, ADR-030). */
export function billReminderText({
  name,
  when,
  autopay,
}: BillReminder): string {
  const what = safeName(name, "One of your bills");
  const subject = what === "One of your bills" ? what : `Your ${what} bill`;
  return autopay
    ? `${subject} is due ${when} and is set to be paid automatically. Reply DETAILS to see the amount.`
    : `${subject} is due ${when}. Reply DETAILS to see the amount.`;
}

/** "today", "tomorrow", or "on " + the long date the caller formatted. */
export function dueWords(daysAway: number, longDate: string): string {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `on ${longDate}`;
}
