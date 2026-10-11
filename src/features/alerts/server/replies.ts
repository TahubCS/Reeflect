import "server-only";
import { formatLong } from "@/features/cashflow";
import type { VerifiedIdentity } from "@/features/messaging";
import {
  confirmPattern,
  setPaymentDisposition,
  setPaymentIntent,
} from "@/features/recurring";
import { dueWords } from "../domain/copy";
import { billDetails, subscriptionDetails } from "../domain/details";
import { type AlertReply, parseAlertReply } from "../domain/reply";
import { daysBetween } from "../domain/timing";
import { latestSent } from "./outbox";
import { billsNow, findSubscription } from "./subjects";

// Replies to the last proactive text (ADR-105), carried out by code. A
// reply answers the most recent alert sent to this phone in the last three
// days, and only that one. The workspace comes from the verified phone
// (ADR-034), never from the text.

export const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;

export const ALERT_REPLIES = {
  nothingOpen:
    "There's no recent alert to answer. Text me a question about your money any time.",
  gone: "I can't find that any more; it may have changed on the website. You can check it under Recurring payments.",
  kept: (name: string) =>
    `Got it: ${name} is confirmed and marked Keep. You can change that under Recurring payments.`,
  cancelling: (name: string) =>
    `Got it: ${name} is confirmed and marked Planning to cancel. I can't cancel it for you; that's done with the company.`,
  ignored: (name: string) =>
    `Okay, I won't count ${name} as a subscription. You can restore it under Recurring payments.`,
  notForBills:
    "That reminder was about a bill, so there's nothing to keep or cancel. Reply DETAILS to see the amount.",
} as const;

/** The reply to a KEEP/CANCEL/IGNORE/DETAILS text, or null for any other text. */
export async function alertReplyTurn(
  text: string,
  identity: VerifiedIdentity,
  now: Date = new Date(),
): Promise<string | null> {
  const reply = parseAlertReply(text);
  if (reply.type === "none") return null;

  const message = await latestSent(
    identity.identityId,
    new Date(now.getTime() - REPLY_WINDOW_MS),
  );
  if (message === null || message.workspaceId !== identity.workspaceId) {
    return ALERT_REPLIES.nothingOpen;
  }
  return message.kind === "subscription_alert"
    ? subscriptionReply(reply, identity.workspaceId, message.subjectKey, now)
    : billReply(reply, identity.workspaceId, message.subjectKey, now);
}

async function subscriptionReply(
  reply: Exclude<AlertReply, { type: "none" }>,
  workspaceId: string,
  key: string,
  now: Date,
): Promise<string> {
  const payment = await findSubscription(workspaceId, key, now);
  if (payment === null) return ALERT_REPLIES.gone;
  // A reply to the user's own text may name amounts (ADR-038), so the
  // saved name is used as it is.
  const name = payment.name;
  const { accountId, merchant } = payment;

  if (reply.type === "details") {
    return subscriptionDetails({
      name,
      amount: payment.amount,
      fixed: payment.amountMode === "fixed",
      cadence: payment.cadence,
      monthly: payment.monthly,
      yearly: payment.yearly,
    });
  }
  if (reply.type === "ignore") {
    const result = await setPaymentDisposition(
      workspaceId,
      accountId,
      merchant,
      "dismiss",
      now,
      "subscription",
    );
    return result === "ok" ? ALERT_REPLIES.ignored(name) : ALERT_REPLIES.gone;
  }

  // KEEP or CANCEL: the reply is the user's confirmation (ADR-105).
  if (payment.decision !== "confirmed") {
    const confirmed = await confirmPattern(
      workspaceId,
      accountId,
      merchant,
      now,
      "subscription",
    );
    if (confirmed !== "ok") return ALERT_REPLIES.gone;
  }
  const intent = reply.type === "keep" ? "keep" : "cancel";
  const result = await setPaymentIntent(
    workspaceId,
    accountId,
    merchant,
    intent,
  );
  if (result !== "ok") return ALERT_REPLIES.gone;
  return intent === "keep"
    ? ALERT_REPLIES.kept(name)
    : ALERT_REPLIES.cancelling(name);
}

async function billReply(
  reply: Exclude<AlertReply, { type: "none" }>,
  workspaceId: string,
  key: string,
  now: Date,
): Promise<string> {
  if (reply.type !== "details") return ALERT_REPLIES.notForBills;
  const { today, bills, liquid } = await billsNow(workspaceId, now);
  const bill = bills.find((candidate) => candidate.key === key);
  if (!bill) return ALERT_REPLIES.gone;
  return billDetails({
    name: bill.payment.name,
    remaining: bill.cycle.remaining,
    estimated: bill.cycle.invoiceCents === null,
    when: dueWords(
      daysBetween(today, bill.cycle.dueOn),
      formatLong(bill.cycle.dueOn),
    ),
    autopay: bill.autopay,
    liquid,
  });
}
