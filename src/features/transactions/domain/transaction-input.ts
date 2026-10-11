import { z } from "zod";
import type { ACCOUNT_TYPES, DATA_SOURCES } from "@/lib/db/schema/finance";
import {
  type Cents,
  ZERO,
  absolute,
  formatCents,
  negate,
  parseDollars,
} from "@/lib/money";

// What a person types to add or edit a transaction by hand (F-04), the shapes
// the server hands back, and the rule for how a manual transaction moves an
// account's balance (ADR-050). Plain TypeScript, so the form in the browser,
// the server actions and the pages share it.

type AccountType = (typeof ACCOUNT_TYPES)[number];
type DataSource = (typeof DATA_SOURCES)[number];

/** A transaction as pages and other features see it. */
export type TransactionSummary = {
  id: string;
  accountId: string;
  accountNickname: string;
  accountType: AccountType;
  /** "YYYY-MM-DD". */
  postedOn: string;
  /** Signed per ADR-008: negative is money out of the account. */
  amountCents: Cents;
  description: string;
  status: "pending" | "posted";
  isTransfer: boolean;
  source: DataSource;
  /**
   * Only manual transactions can change account, date, amount or status;
   * the others keep what their source gave them, so a re-sync or re-import
   * still matches them.
   */
  editableInFull: boolean;
};

/** A transaction as the calendar reads it (F-12), with its category. */
export type CalendarTransaction = {
  id: string;
  accountId: string;
  /** "YYYY-MM-DD". */
  postedOn: string;
  /** Signed per ADR-008: negative is money out of the account. */
  amountCents: Cents;
  description: string;
  isTransfer: boolean;
  source: DataSource;
  categoryName: string | null;
  categoryPresetKey: string | null;
  /** Typed by hand (ADR-050). */
  editableInFull: boolean;
};

/** An account the form offers, as the page hands it over. */
export type AccountChoice = {
  id: string;
  nickname: string;
  type: AccountType;
};

/** Our transaction ids are UUID v7 (ARCH-03). */
export const transactionIdSchema = z.uuid();

/** The add/edit form's fields: the only names read from a submitted form. */
export const TRANSACTION_FORM_FIELDS = [
  "accountId",
  "postedOn",
  "direction",
  "amount",
  "description",
  "pending",
  "transfer",
] as const;

export type TransactionFormField = (typeof TRANSACTION_FORM_FIELDS)[number];

/** One message per form field that is wrong. */
export type TransactionFieldErrors = Partial<
  Record<TransactionFormField, string>
>;

/** What a form's server action returns when it does not redirect. */
export type TransactionFormState = {
  errors: TransactionFieldErrors;
  /** What was typed, so the form shows it again: React resets it after an action. */
  values?: Partial<Record<TransactionFormField, string>>;
};

/** The fields that decide where money went and how much. */
export type LedgerInput = {
  accountId: string;
  postedOn: string;
  /** Signed per ADR-008. */
  amountCents: Cents;
  status: "pending" | "posted";
};

export type TransactionInput = {
  description: string;
  isTransfer: boolean;
  /** Null when only the description and transfer mark may change. */
  ledger: LedgerInput | null;
};

export type ParsedTransaction =
  | { readonly ok: true; readonly value: TransactionInput }
  | { readonly ok: false; readonly errors: TransactionFieldErrors };

/** The earliest date a transaction may have. */
export const EARLIEST_DATE = "2000-01-01";

/** A real calendar date written "YYYY-MM-DD". */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
  );
}

function isFormField(name: unknown): name is TransactionFormField {
  return (TRANSACTION_FORM_FIELDS as readonly unknown[]).includes(name);
}

const DESCRIPTION = "Say what it was, like “Groceries” or “Paycheck”.";

const detailsSchema = z.object({
  description: z
    .string(DESCRIPTION)
    .trim()
    .min(1, DESCRIPTION)
    .max(200, "Use 200 characters or fewer."),
  // An unticked checkbox sends nothing; a ticked one sends "on". Only "on"
  // counts as ticked.
  transfer: z.string().optional(),
});

const ledgerSchema = z.object({
  accountId: z.uuid("Choose an account."),
  direction: z.enum(["out", "in"], {
    error: "Choose money out or money in.",
  }),
  pending: z.string().optional(),
});

function readText(raw: unknown, name: TransactionFormField): string {
  if (typeof raw === "object" && raw !== null && name in raw) {
    const value = (raw as Record<string, unknown>)[name];
    return typeof value === "string" ? value.trim() : "";
  }
  return "";
}

function collect(
  errors: TransactionFieldErrors,
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
) {
  for (const issue of issues) {
    const field = issue.path[0];
    if (isFormField(field)) errors[field] ??= issue.message;
  }
}

/**
 * Checks the add/edit form. The amount is typed as a plain amount with a
 * "money out / money in" choice and stored signed from the account holder's
 * point of view (ADR-008): money out is negative on any account, so a card
 * purchase is negative and a card payment positive.
 *
 * `today` is "YYYY-MM-DD" in the user's time zone; later dates are refused,
 * because bills still to come are F-22's. When `ledgerEditable` is false
 * (an imported or synced row) only the description and transfer mark are
 * read.
 */
export function parseTransactionForm(
  raw: unknown,
  options: { today: string; ledgerEditable: boolean },
): ParsedTransaction {
  const errors: TransactionFieldErrors = {};
  const details = detailsSchema.safeParse(raw);
  if (!details.success) collect(errors, details.error.issues);

  let ledger: LedgerInput | null = null;
  if (options.ledgerEditable) {
    const parsed = ledgerSchema.safeParse(raw);
    if (!parsed.success) collect(errors, parsed.error.issues);

    const postedOn = readText(raw, "postedOn");
    if (!isIsoDate(postedOn)) errors.postedOn = "Enter a date.";
    else if (postedOn > options.today) {
      errors.postedOn = "Enter today or an earlier date.";
    } else if (postedOn < EARLIEST_DATE) {
      errors.postedOn = "Enter a date in 2000 or later.";
    }

    const amount = parseDollars(readText(raw, "amount"));
    if (amount === null) {
      errors.amount = "Enter an amount above zero, like 12.50.";
    }

    if (parsed.success && amount !== null && errors.postedOn === undefined) {
      ledger = {
        accountId: parsed.data.accountId,
        postedOn,
        amountCents: parsed.data.direction === "out" ? negate(amount) : amount,
        status: parsed.data.pending === "on" ? "pending" : "posted",
      };
    }
  }

  if (!details.success || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      description: details.data.description,
      isTransfer: details.data.transfer === "on",
      ledger,
    },
  };
}

/** The account fields that decide whether a transaction moves its balance. */
export type BalanceAnchor = {
  source: DataSource;
  /** The day the stored balance was typed; null if never set. */
  balanceAsOf: string | null;
};

/**
 * How much a manual transaction moves its account's stored balance (ADR-050).
 * A manual account's balance is what the person typed on `balanceAsOf`; a
 * transaction dated that day or later is counted on top of it, an earlier
 * one is already inside it. Synced accounts get their balance from their
 * source, so nothing typed here moves it.
 */
export function balanceEffect(
  account: BalanceAnchor,
  transaction: { postedOn: string; amountCents: Cents },
): Cents {
  if (account.source !== "manual" || account.balanceAsOf === null) return ZERO;
  return transaction.postedOn >= account.balanceAsOf
    ? transaction.amountCents
    : ZERO;
}

/** The form's start values for an existing transaction. */
export function formValues(
  transaction: TransactionSummary,
): Record<TransactionFormField, string> {
  return {
    accountId: transaction.accountId,
    postedOn: transaction.postedOn,
    direction: transaction.amountCents < 0 ? "out" : "in",
    amount: formatCents(absolute(transaction.amountCents)),
    description: transaction.description,
    pending: transaction.status === "pending" ? "on" : "",
    transfer: transaction.isTransfer ? "on" : "",
  };
}

const dayHeading = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** "Saturday, October 10, 2026" for "2026-10-10". */
export function formatDay(isoDate: string): string {
  return dayHeading.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * Transactions grouped by day, keeping the order they came in (newest
 * first from the repository).
 */
export function groupByDay<T extends { postedOn: string }>(
  transactions: readonly T[],
): { day: string; transactions: T[] }[] {
  const groups: { day: string; transactions: T[] }[] = [];
  for (const transaction of transactions) {
    const last = groups.at(-1);
    if (last?.day === transaction.postedOn) last.transactions.push(transaction);
    else
      groups.push({ day: transaction.postedOn, transactions: [transaction] });
  }
  return groups;
}
