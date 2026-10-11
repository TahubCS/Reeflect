import "server-only";
import { readBills } from "@/features/bills";
import { type CycleView, isSettled } from "@/features/bills/client";
import { listRecurringPayments } from "@/features/recurring";
import type { Payment } from "@/features/recurring/client";
import { type Cents, cents, sum } from "@/lib/money";
import { inReminderWindow } from "../domain/timing";

// What a proactive text is about, read fresh from recurring payments
// (ADR-058) and Bills (ADR-063) each time: when it is queued, again just
// before it is sent, and when the user replies DETAILS. Nothing about it is
// copied into the outbox. Callers pass a workspace id that came from a
// verified, opted-in phone (ADR-034).

/** A subscription found by code that the user has not confirmed yet. */
export const isNewSubscription = (payment: Payment): boolean =>
  payment.kind === "subscription" &&
  payment.decision === "candidate" &&
  payment.active;

export async function newSubscriptions(
  workspaceId: string,
  now: Date,
): Promise<Payment[]> {
  const { payments } = await listRecurringPayments(workspaceId, now);
  return payments.filter(isNewSubscription);
}

export async function findSubscription(
  workspaceId: string,
  key: string,
  now: Date,
): Promise<Payment | null> {
  const { payments } = await listRecurringPayments(workspaceId, now);
  return payments.find((payment) => payment.key === key) ?? null;
}

export type BillSubject = {
  key: string;
  payment: Payment;
  cycle: CycleView;
  autopay: boolean;
};

export type BillsNow = {
  today: string;
  bills: BillSubject[];
  /** Checking plus savings, or null when the workspace has neither. */
  liquid: Cents | null;
};

/** One reminder per bill per cycle (ADR-030): the key names both. */
export const billKey = (payment: Payment, cycle: CycleView): string =>
  `${payment.key}|${cycle.scheduledOn}`;

export async function billsNow(
  workspaceId: string,
  now: Date,
): Promise<BillsNow> {
  const { today, accounts, bills } = await readBills(workspaceId, now);
  const liquid = accounts.filter(
    (account) => account.type === "checking" || account.type === "savings",
  );
  return {
    today,
    liquid:
      liquid.length === 0
        ? null
        : sum(liquid.map((account) => cents(account.currentBalanceCents))),
    bills: bills.flatMap(({ payment, detail, cycles }) =>
      cycles.map((cycle) => ({
        key: billKey(payment, cycle),
        payment,
        cycle,
        autopay: detail?.autopay ?? false,
      })),
    ),
  };
}

/** A bill that should be reminded about today: due within the week, unpaid. */
export const isDueSoon = (bill: BillSubject, today: string): boolean =>
  bill.payment.decision === "confirmed" &&
  !isSettled(bill.cycle) &&
  inReminderWindow(today, bill.cycle.dueOn);
