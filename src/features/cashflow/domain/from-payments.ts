import type { Payment } from "@/features/recurring/client";
import { negate } from "@/lib/money";
import type { Recurring } from "./cashflow";
import type { AccountRecord } from "./from-records";

// Turns Recurring payments (F-10) into the calendar's repeating items. Pure:
// the server loader reads the payments and hands them over (ADR-042).

const CATEGORY: Record<Recurring["kind"], string> = {
  income: "Pay",
  bill: "Bills",
  subscription: "Subscriptions",
};

/**
 * Confirmed, active payments with a next date. Suggestions wait for the
 * person to confirm them (ADR-058). Amounts are F-10's estimates, signed:
 * pay is money in, bills and subscriptions money out. A card's payments are
 * marked so they do not move the balance line; a loan account's are left out,
 * like its transactions.
 */
export function toRecurring(
  payments: readonly Payment[],
  accounts: readonly AccountRecord[],
): Recurring[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return payments.flatMap((payment): Recurring[] => {
    const account = byId.get(payment.accountId);
    if (
      payment.decision !== "confirmed" ||
      !payment.active ||
      payment.nextOn === null ||
      account === undefined ||
      account.type === "loan"
    )
      return [];
    return [
      {
        id: payment.key,
        name: payment.name,
        amount:
          payment.kind === "income" ? payment.amount : negate(payment.amount),
        kind: payment.kind,
        category: CATEGORY[payment.kind],
        unit: payment.unit,
        every: payment.every,
        nextOn: payment.nextOn,
        onCard: account.type === "credit_card",
        monthly: payment.monthly,
        yearly: payment.yearly,
        userIntent: payment.userIntent,
        target: { accountId: payment.accountId, merchant: payment.merchant },
      },
    ];
  });
}
