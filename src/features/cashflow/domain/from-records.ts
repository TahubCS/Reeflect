import { type Cents, subtract, sum } from "@/lib/money";
import type { CashflowData, Entry, Kind, Source } from "./cashflow";
import {
  type IsoDate,
  type YearMonth,
  addMonths,
  daysInMonth,
  monthOf,
  monthsApart,
  toIso,
} from "./dates";

// Turns the workspace's accounts and transactions into the calendar's data.
// Pure: the server loader reads the rows and hands them over (ADR-042).

/** The category name of a row with no category. */
export const UNCATEGORIZED = "Uncategorized";

/** How many months before this one the calendar can show. */
export const MONTHS_BACK = 2;
/** How many months after this one the calendar can show. */
export const MONTHS_AHEAD = 2;

export type AccountRecord = {
  id: string;
  type: "checking" | "savings" | "credit_card" | "loan";
  nickname: string;
  /** Signed per ADR-008: negative on a card or loan means money owed. */
  balanceCents: Cents;
};

export type TransactionRecord = {
  id: string;
  accountId: string;
  postedOn: IsoDate;
  /** Signed per ADR-008: negative is money out of the account. */
  amountCents: Cents;
  description: string;
  isTransfer: boolean;
  source: string;
  categoryName: string | null;
  categoryPresetKey: string | null;
  /** Typed by hand, so the day panel may remove it (ADR-050). */
  editableInFull: boolean;
};

/** The dates the loader reads: the first day it may show to the last. */
export function dashboardWindow(today: IsoDate): {
  from: IsoDate;
  to: IsoDate;
} {
  const first = addMonths(monthOf(today), -MONTHS_BACK);
  const last = addMonths(monthOf(today), MONTHS_AHEAD);
  return {
    from: toIso(first.year, first.month, 1),
    to: toIso(last.year, last.month, daysInMonth(last)),
  };
}

/** Liquid money is checking plus savings (ADR-024). */
const isLiquid = (account: AccountRecord) =>
  account.type === "checking" || account.type === "savings";

/** The presets ADR-030 treats as bills; the rest of the spending is day to day. */
const BILL_PRESETS = new Set(["housing", "utilities", "insurance", "loans"]);

function sourceOf(source: string): Source {
  if (source === "manual") return "manual";
  if (source === "text") return "text";
  return "bank";
}

function kindOf(record: TransactionRecord): Kind {
  if (record.amountCents > 0) return "income";
  if (record.categoryPresetKey && BILL_PRESETS.has(record.categoryPresetKey))
    return "bill";
  return "everyday";
}

/**
 * The calendar's data. The balance today is the stored balance of the
 * checking and savings accounts, as the Accounts page shows it; the opening
 * balance is worked back from it through this window's transactions up to
 * today. Card rows show as spending without moving that balance. Transfers
 * between the workspace's own accounts (ADR-020) and loan accounts' own rows
 * are left out.
 */
export function toCashflowData({
  accounts,
  transactions,
  today,
}: {
  accounts: readonly AccountRecord[];
  transactions: readonly TransactionRecord[];
  today: IsoDate;
}): CashflowData {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const window = dashboardWindow(today);
  const shown = transactions.filter((record) => {
    const account = byId.get(record.accountId);
    return (
      account !== undefined &&
      account.type !== "loan" &&
      !record.isTransfer &&
      record.postedOn >= window.from &&
      record.postedOn <= window.to
    );
  });

  const thisMonth = monthOf(today);
  const oldest = shown.reduce<IsoDate | null>(
    (found, record) =>
      found === null || record.postedOn < found ? record.postedOn : found,
    null,
  );
  const start: YearMonth =
    oldest !== null && monthsApart(monthOf(oldest), thisMonth) > 0
      ? monthOf(oldest)
      : thisMonth;

  const named = accounts.length > 1;
  const entries = shown.map((record): Entry => {
    const account = byId.get(record.accountId)!;
    return {
      id: record.id,
      date: record.postedOn,
      name: record.description,
      amount: record.amountCents,
      kind: kindOf(record),
      category: record.categoryName ?? UNCATEGORIZED,
      source: sourceOf(record.source),
      accountName: named ? account.nickname : undefined,
      onCard: !isLiquid(account),
      removable: record.editableInFull,
    };
  });

  const balanceToday = sum(
    accounts.filter(isLiquid).map((a) => a.balanceCents),
  );
  const sinceStart = sum(
    entries
      .filter((entry) => !entry.onCard && entry.date <= today)
      .map((entry) => entry.amount),
  );

  return {
    start,
    openingBalance: subtract(balanceToday, sinceStart),
    entries,
    recurring: [],
  };
}
