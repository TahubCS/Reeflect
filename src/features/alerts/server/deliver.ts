import "server-only";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatLong } from "@/features/cashflow";
import { getQuietHours, sendToPhone } from "@/features/messaging";
import {
  billReminderText,
  dueWords,
  subscriptionAlertText,
} from "../domain/copy";
import { daysBetween, sendTime, startOfDayIn } from "../domain/timing";
import type { Deliver, Outcome } from "./outbox";
import {
  billsNow,
  findSubscription,
  isDueSoon,
  isNewSubscription,
} from "./subjects";

// Decides what happens to one queued text (ADR-038, ADR-105), in order:
// the phone may still be texted first; it is not quiet hours; fewer than
// three went out today; what it is about still needs saying. Only then is
// it sent. Every check is repeated here because time has passed since the
// text was queued.

/** The words to send now, or null when the text is no longer needed. */
async function wordsFor(
  kind: "subscription_alert" | "bill_reminder",
  workspaceId: string,
  subjectKey: string,
  now: Date,
): Promise<string | null> {
  if (kind === "subscription_alert") {
    const payment = await findSubscription(workspaceId, subjectKey, now);
    return payment && isNewSubscription(payment)
      ? subscriptionAlertText(payment.name)
      : null;
  }
  const { today, bills } = await billsNow(workspaceId, now);
  const bill = bills.find((candidate) => candidate.key === subjectKey);
  // Paid, marked paid, past due or dropped: no reminder (ADR-030).
  if (!bill || !isDueSoon(bill, today)) return null;
  return billReminderText({
    name: bill.payment.name,
    when: dueWords(
      daysBetween(today, bill.cycle.dueOn),
      formatLong(bill.cycle.dueOn),
    ),
    autopay: bill.autopay,
  });
}

export function makeDeliver(
  now: Date,
  send: typeof sendToPhone = sendToPhone,
): Deliver {
  const decide: Deliver = async (message, target, sentToday) => {
    if (target === null || target.workspaceId !== message.workspaceId) {
      return { status: "cancelled" };
    }
    const wanted =
      message.kind === "subscription_alert"
        ? target.subscriptionAlerts
        : target.billReminders;
    if (!wanted) return { status: "cancelled" };

    const hours = await getQuietHours(target.userId);
    const sent = await sentToday(startOfDayIn(now, DEFAULT_TIME_ZONE));
    const at = sendTime(now, hours, sent, DEFAULT_TIME_ZONE);
    if (at.getTime() > now.getTime()) return { status: "later", notBefore: at };

    const text = await wordsFor(
      message.kind,
      message.workspaceId,
      message.subjectKey,
      now,
    );
    if (text === null) return { status: "cancelled" };

    return (await send(target.platform, target.spaceId, text))
      ? { status: "sent" }
      : { status: "retry" };
  };
  // A read that fails (a database hiccup, a workspace over its limits)
  // counts as a failed attempt, so the row is retried and then given up.
  return async (message, target, sentToday): Promise<Outcome> => {
    try {
      return await decide(message, target, sentToday);
    } catch (error) {
      console.error("alerts: delivery check failed", {
        messageId: message.id,
        reason: error instanceof Error ? error.name : "unknown",
      });
      return { status: "retry" };
    }
  };
}
