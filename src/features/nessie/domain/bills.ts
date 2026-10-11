// Nessie bills → confirmed recurring payments (ADR-058). Pure.
//
// A bill with a `recurring_date` (day of the month) repeats monthly from its
// `payment_date`, the start date. Its payee is matched to ledger rows the
// same way detected payments are, by normalized merchant, so a charge on
// the due day moves the next date forward (recurring `buildPayments`).
import { normalizeMerchant } from "@/features/categorization/client";
import { monthNumber, shiftMonths } from "@/features/recurring/client";
import { type Cents, fromDollarNumber } from "@/lib/money";
import { readTags } from "./map";
import type { NessieBill } from "./records";

export type SyncedSeries = {
  merchant: string;
  name: string;
  kind: "bill" | "subscription";
  amountCents: Cents;
  /** The first due date on or after today. */
  nextOn: string;
};

const SUBSCRIPTION_CATEGORIES = new Set(["subscriptions", "entertainment"]);

/** The first monthly due date on or after `today`, never before `start`. */
export function nextDueOn(start: string, day: number, today: string): string {
  let next = shiftMonths(start, 0, day);
  if (next < start) next = shiftMonths(start, 1, day);
  if (next >= today) return next;
  next = shiftMonths(next, monthNumber(today) - monthNumber(next), day);
  return next >= today ? next : shiftMonths(next, 1, day);
}

export function mapBills(
  bills: readonly NessieBill[],
  today: string,
): SyncedSeries[] {
  const byMerchant = new Map<string, SyncedSeries>();
  for (const bill of bills) {
    const status = bill.status.toLowerCase();
    if (status === "cancelled" || status === "canceled") continue;
    if (bill.recurring_date === undefined) continue;
    const merchant = normalizeMerchant(bill.payee);
    if (!merchant) continue;
    const amountCents = fromDollarNumber(bill.payment_amount);
    if (amountCents <= 0) continue;
    const { text, category } = readTags(bill.nickname ?? "");
    // One series per merchant on an account (the unique index): last wins.
    byMerchant.set(merchant, {
      merchant,
      name: (text || bill.payee.trim()).slice(0, 80),
      kind:
        category && SUBSCRIPTION_CATEGORIES.has(category)
          ? "subscription"
          : "bill",
      amountCents,
      nextOn: nextDueOn(bill.payment_date ?? today, bill.recurring_date, today),
    });
  }
  return [...byMerchant.values()];
}
