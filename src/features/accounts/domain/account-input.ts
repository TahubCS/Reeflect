import { z } from "zod";
import type { ACCOUNT_TYPES, DATA_SOURCES } from "@/lib/db/schema/finance";
import {
  type Cents,
  absolute,
  formatCents,
  negate,
  parseBalance,
} from "@/lib/money";

// What a person types to add or edit a bank or card account (F-03), and the
// shapes the server hands back. Plain TypeScript, so the form in the browser,
// the server actions and the pages share it.

export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** An account as pages and other features see it. */
export type AccountSummary = {
  id: string;
  type: AccountType;
  institutionName: string;
  nickname: string;
  maskLast4: string | null;
  /** Signed per ADR-008: negative on a card or loan means money owed. */
  balanceCents: Cents;
  balanceAsOf: string | null;
  source: (typeof DATA_SOURCES)[number];
  /**
   * Only manual accounts take a typed balance and type; the others get both
   * from their source when they sync.
   */
  balanceEditable: boolean;
};

/** What a form's server action returns when it does not redirect. */
export type AccountFormState = {
  errors: AccountFieldErrors;
  /** What was typed, so the form shows it again: React resets it after an action. */
  values?: Record<string, string>;
};

/** Our account ids are UUID v7 (ARCH-03). */
export const accountIdSchema = z.uuid();

/** Every account type, in the order the form offers them. */
export const ACCOUNT_TYPE_LABELS = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  loan: "Loan",
} as const satisfies Record<AccountType, string>;

export const ACCOUNT_TYPE_OPTIONS = Object.keys(
  ACCOUNT_TYPE_LABELS,
) as AccountType[];

/** Cards and loans hold what the person owes, not what they have. */
export function owesMoney(type: AccountType): boolean {
  return type === "credit_card" || type === "loan";
}

/** The balance field's label, which says which way the number points. */
export function balanceLabel(type: AccountType): string {
  return owesMoney(type) ? "Amount owed" : "Current balance";
}

/**
 * A stored balance as the person reads it: "$300.00" owed on a card (stored
 * as −$300.00), or the signed balance of a checking or savings account. The
 * form starts from this, and the list shows it next to "Owed" or "Balance".
 */
export function displayedBalance(
  type: AccountType,
  balanceCents: Cents,
): string {
  return formatCents(owesMoney(type) ? absolute(balanceCents) : balanceCents);
}

export type AccountInput = {
  type: AccountType;
  institutionName: string;
  nickname: string;
  maskLast4: string | null;
  /** Signed per ADR-008 (owed is negative); null leaves the balance alone. */
  balanceCents: Cents | null;
};

type Field = "type" | "institutionName" | "nickname" | "maskLast4" | "balance";

/** One message per form field that is wrong. */
export type AccountFieldErrors = Partial<Record<Field, string>>;

export type ParsedAccount =
  | { readonly ok: true; readonly value: AccountInput }
  | { readonly ok: false; readonly errors: AccountFieldErrors };

const FIELDS: readonly string[] = [
  "type",
  "institutionName",
  "nickname",
  "maskLast4",
  "balance",
] satisfies Field[];

const accountFormSchema = z.object({
  type: z.enum(ACCOUNT_TYPE_OPTIONS as [AccountType, ...AccountType[]], {
    error: "Choose an account type.",
  }),
  institutionName: z
    .string("Enter the bank or card issuer.")
    .trim()
    .min(1, "Enter the bank or card issuer.")
    .max(80, "Use 80 characters or fewer."),
  nickname: z
    .string("Give the account a name you'll recognize.")
    .trim()
    .min(1, "Give the account a name you'll recognize.")
    .max(60, "Use 60 characters or fewer."),
  // Only ever the last four digits: a full account number is never stored.
  maskLast4: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "Enter only the last 4 digits, or leave it blank.")
    .optional(),
});

const BALANCE_FORMAT = "Enter an amount like 1,204.50.";

/**
 * Checks the add/edit form. The balance is typed as a plain amount ("owed"
 * for cards and loans) and stored signed from the holder's point of view
 * (ADR-008). When `balanceEditable` is false (a synced account) the balance
 * field is ignored.
 */
export function parseAccountForm(
  raw: unknown,
  options: { balanceEditable: boolean },
): ParsedAccount {
  const result = accountFormSchema.safeParse(raw);
  const errors: AccountFieldErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && FIELDS.includes(field)) {
        errors[field as Field] ??= issue.message;
      }
    }
  }

  let balanceCents: Cents | null = null;
  if (options.balanceEditable) {
    const typed = parseBalance(readBalance(raw));
    const owes = result.success && owesMoney(result.data.type);
    if (typed === null) errors.balance = BALANCE_FORMAT;
    else if (owes && typed < 0) {
      errors.balance = "Enter the amount owed without a minus sign.";
    } else balanceCents = owes ? negate(typed) : typed;
  }

  if (!result.success || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const { type, institutionName, nickname, maskLast4 } = result.data;
  return {
    ok: true,
    value: {
      type,
      institutionName,
      nickname,
      maskLast4: maskLast4 ? maskLast4 : null,
      balanceCents,
    },
  };
}

/** The typed balance, read on its own so its error shows beside the others. */
function readBalance(raw: unknown): string {
  if (typeof raw === "object" && raw !== null && "balance" in raw) {
    return typeof raw.balance === "string" ? raw.balance : "";
  }
  return "";
}

/** "YYYY-MM-DD" for `now` in `timeZone`. */
export function isoDateIn(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
