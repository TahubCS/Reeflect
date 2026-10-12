import { APP_NAME } from "@/config/app";
import { type Cents, formatCents } from "@/lib/money";
import type { LogDay, Unclear } from "./log";

// Every reply about logging (F-27). Written by code, never by a model: the
// amounts are the person's own, formatted here (ADR-035).

const EXAMPLE = '"12 lunch"';

/** What to say when a text looks like spending but cannot be saved. */
export const UNCLEAR_REPLIES: Record<Unclear, string> = {
  no_amount: `How much was it? Send the amount and what it was for, like ${EXAMPLE}. Nothing was logged.`,
  amount_in_words: `Send the amount in digits, like ${EXAMPLE}. Nothing was logged.`,
  no_description: `What was it for? Send it like ${EXAMPLE}. Nothing was logged.`,
  several_amounts: `I saw more than one amount. Send one at a time, like ${EXAMPLE}. Nothing was logged.`,
  bad_amount: `I couldn't read that amount. Send it like "12.50 lunch". Nothing was logged.`,
  abbreviated: `Send the full amount in digits, like "2000 rent". Nothing was logged.`,
  too_large: `That's more than I log by text. Add it on the ${APP_NAME} website. Nothing was logged.`,
  not_usd: `${APP_NAME} works in US dollars only. Send the amount in dollars. Nothing was logged.`,
  income: `I can only log spending by text. Add money coming in on the ${APP_NAME} website. Nothing was logged.`,
  direction: `Was that money coming in or going out? If you spent it, send it like ${EXAMPLE}. Money coming in is added on the website. Nothing was logged.`,
  transfer: `Card payments and moves between your own accounts aren't spending, so I don't log them by text. Nothing was logged.`,
  setting: `I can't change budgets or goals by text yet. Set them on the ${APP_NAME} website. Nothing was logged.`,
  other_day: `I can log for today or yesterday. Add other days on the ${APP_NAME} website. Nothing was logged.`,
};

export const LOG_REPLIES = {
  noAccounts: `Add an account on the ${APP_NAME} website first, then I can log spending.`,
  loan: "Spending can't be logged on a loan. Name a checking, savings or card account. Nothing was logged.",
  onlyLoans: `Spending can't be logged on a loan, and loans are all I see for you. Add a checking, savings or card account on the ${APP_NAME} website first. Nothing was logged.`,
  tooMany: `That's a lot for one day. Add the rest on the ${APP_NAME} website. Nothing was logged.`,
  notSaved:
    "I couldn't save that, so nothing was logged. Try again in a minute.",
  nothingToUndo:
    "There's nothing to undo: I haven't logged anything from your texts in the last day.",
} as const;

/** At most this many accounts are listed, and numbered, in one reply. */
export const MAX_LISTED_ACCOUNTS = 5;

/**
 * Asks which account, numbering theirs. The spending is remembered while
 * the question is open (ADR-065), so the answer is a number or a name.
 */
export function whichAccountReply(
  amount: Cents,
  description: string,
  nicknames: readonly string[],
): string {
  const list = nicknames
    .slice(0, MAX_LISTED_ACCOUNTS)
    .map((nickname, index) => `${index + 1} ${nickname}`)
    .join(", ");
  return `Which account for ${formatCents(amount)} "${description}"? Reply with its number or name: ${list}. Nothing is logged yet.`;
}

export type Logged = {
  amount: Cents;
  description: string;
  day: LogDay;
  /** Named only when the workspace has more than one account. */
  account: string | null;
  category: string | null;
  /** What is left in that category's budget this month, when one is set. */
  budgetLeft: Cents | null;
};

export function loggedReply(logged: Logged): string {
  const on = logged.account === null ? "" : ` on ${logged.account}`;
  const category = logged.category === null ? "" : `, in ${logged.category}`;
  const budget =
    logged.budgetLeft === null || logged.category === null
      ? ""
      : ` ${formatCents(logged.budgetLeft)} left in ${logged.category} this month.`;
  return `Logged ${formatCents(logged.amount)} for "${logged.description}" ${logged.day}${on}${category}.${budget} Text UNDO to remove it.`;
}

export function undoneReply(amount: Cents, description: string): string {
  return `Removed ${formatCents(amount)} for "${description}".`;
}
