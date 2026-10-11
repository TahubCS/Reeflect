import type { PlannedSummary } from "@/features/plans";
import type { Entry } from "./cashflow";
import {
  type AccountRecord,
  UNCATEGORIZED,
  isLiquid,
  kindOf,
} from "./from-records";

// Turns the person's plans (F-37) into calendar entries. Pure: the server
// loader reads them and hands them over (ADR-042). They are added after
// `toCashflowData`, so the opening balance never counts a plan (ADR-102).

/**
 * One entry per plan on a checking, savings or card account; a loan's are
 * left out, like its transactions. Kinds follow the transaction rules, so a
 * planned rent payment is a bill and a planned refund is money in.
 */
export function plansToEntries(
  plans: readonly PlannedSummary[],
  accounts: readonly AccountRecord[],
): Entry[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const named = accounts.length > 1;
  return plans.flatMap((plan): Entry[] => {
    const account = byId.get(plan.accountId);
    if (account === undefined || account.type === "loan") return [];
    return [
      {
        id: plan.id,
        date: plan.plannedOn,
        name: plan.description,
        amount: plan.amountCents,
        kind: kindOf(plan),
        category: plan.categoryName ?? UNCATEGORIZED,
        source: "manual",
        accountName: named ? account.nickname : undefined,
        onCard: !isLiquid(account),
        removable: true,
        isPlan: true,
      },
    ];
  });
}
