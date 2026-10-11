import { APP_NAME } from "@/config/app";
import { type Cents, formatCents } from "@/lib/money";
import { MAX_LISTED_ACCOUNTS, UNCLEAR_REPLIES } from "./log-replies";
import type { ReceiptDeclined } from "./receipt";

// Every reply about a receipt photo (F-29, ADR-067). Written by code, never
// by a model. The amount in a question is the one read from the photo,
// checked and formatted by code, and shown so the person can refuse it
// (ADR-035).

const EXAMPLE = '"12 lunch"';

export const RECEIPT_REPLIES = {
  off: `I can't read photos yet. Text the amount and what it was for, like ${EXAMPLE}. Nothing was logged.`,
  tooLargeFile: `That photo is too big for me to read. Text the amount and what it was for, like ${EXAMPLE}. Nothing was logged.`,
  unsupported: `I can't read that kind of file. Send a photo of the receipt, or text it like ${EXAMPLE}. Nothing was logged.`,
  several: "Send one receipt photo at a time. Nothing was logged.",
  unavailable: `I couldn't get that photo. Send it again, or text it like ${EXAMPLE}. Nothing was logged.`,
  notNow: `I can't read photos right now. Text it like ${EXAMPLE}. Nothing was logged.`,
  dropped: `Okay, I dropped it. Nothing was logged. You can text it instead, like ${EXAMPLE}.`,
  nothingWaiting: `There's nothing waiting for an answer. To log spending, text it like ${EXAMPLE}.`,
} as const;

/** What to say when the photo was read but gives no proposal. */
export const DECLINED_REPLIES: Record<ReceiptDeclined, string> = {
  unreadable: `I couldn't read that photo. Try a clearer one, or text it like ${EXAMPLE}. Nothing was logged.`,
  not_receipt: `That doesn't look like a receipt. I can log spending from a receipt photo or a text like ${EXAMPLE}. Nothing was logged.`,
  refund: `That looks like a refund. I can only log spending by text. Add money coming in on the ${APP_NAME} website. Nothing was logged.`,
  not_usd: UNCLEAR_REPLIES.not_usd,
  no_total: `I couldn't find the total on that receipt. Text the amount and what it was for, like ${EXAMPLE}. Nothing was logged.`,
  too_large: UNCLEAR_REPLIES.too_large,
};

const numbered = (nicknames: readonly string[]) =>
  nicknames
    .slice(0, MAX_LISTED_ACCOUNTS)
    .map((nickname, index) => `${index + 1} ${nickname}`)
    .join(", ");

export type ReceiptQuestion = {
  amount: Cents;
  /** Null when no usable name was read. */
  merchant: string | null;
  category: string | null;
  /** The accounts it could go on, in the order they are numbered. */
  nicknames: readonly string[];
};

/**
 * Asks whether to log what was read. With one account the answer is yes or
 * no; with several, naming the account is the yes.
 */
export function receiptQuestion(question: ReceiptQuestion): string {
  const where =
    question.merchant === null
      ? "on that receipt"
      : `at "${question.merchant}"`;
  const category =
    question.category === null ? "" : `, in ${question.category}`;
  const read = `I read ${formatCents(question.amount)} ${where}${category}.`;
  return question.nicknames.length > 1
    ? `${read} Reply with the account's number or name to log it: ${numbered(question.nicknames)}. Or reply no to drop it. Nothing is logged yet.`
    : `${read} Reply yes to log it, or no to drop it. Nothing is logged yet.`;
}

/** Asked again when "yes" does not say which of several accounts. */
export function whichAccountForReceipt(nicknames: readonly string[]): string {
  return `Which account? Reply with its number or name: ${numbered(nicknames)}. Or reply no to drop it. Nothing is logged yet.`;
}
