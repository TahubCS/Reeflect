import "server-only";
import type { sendToPhone } from "@/features/messaging";
import { makeDeliver } from "./deliver";
import { deliverOne, enqueue, listAlertTargets } from "./outbox";
import { billsNow, isDueSoon, newSubscriptions } from "./subjects";

// One run of the job clock (ADR-041, ADR-105): queue what is new, then send
// what is due. Safe to run again at any time: queueing is once per subject,
// and each row is locked while it is sent.

/** Texts sent per run at most; the rest wait for the next tick. */
export const MAX_DELIVERIES_PER_TICK = 50;

export type TickResult = {
  queued: number;
  handled: number;
  failedTargets: number;
};

export async function runAlertsTick(
  now: Date = new Date(),
  send?: typeof sendToPhone,
): Promise<TickResult> {
  let queued = 0;
  let failedTargets = 0;

  for (const target of await listAlertTargets()) {
    try {
      if (target.subscriptionAlerts) {
        for (const payment of await newSubscriptions(target.workspaceId, now)) {
          if (await enqueue(target, "subscription_alert", payment.key, now)) {
            queued += 1;
          }
        }
      }
      if (target.billReminders) {
        const { today, bills } = await billsNow(target.workspaceId, now);
        for (const bill of bills.filter((b) => isDueSoon(b, today))) {
          if (await enqueue(target, "bill_reminder", bill.key, now)) {
            queued += 1;
          }
        }
      }
    } catch (error) {
      // One workspace's bad data must not stop everyone else's texts.
      failedTargets += 1;
      console.error("alerts: could not check a workspace", {
        identityId: target.identityId,
        reason: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  const deliver = makeDeliver(now, send);
  let handled = 0;
  while (
    handled < MAX_DELIVERIES_PER_TICK &&
    (await deliverOne(now, deliver))
  ) {
    handled += 1;
  }
  return { queued, handled, failedTargets };
}
