import type { Cents } from "@/lib/money";

// What a statement template reads out of a PDF (ADR-044) and what every
// import emits (ADR-009): rows plus the statement's own facts, all read by
// code. Amounts are signed from the account holder's point of view (ADR-008).

export type StatementAccountType =
  "checking" | "savings" | "credit_card" | "loan";

/** One transaction as the statement prints it. Dates are `YYYY-MM-DD`. */
export type StatementRow = {
  postedOn: string;
  description: string;
  amountCents: Cents;
  /** The balance printed after this row, when the statement has that column. */
  runningBalanceCents: Cents | null;
};

export type ParsedStatement = {
  institution: string;
  /** The product as printed, e.g. "360 Savings". */
  productName: string;
  accountType: StatementAccountType | null;
  accountLast4: string;
  currency: "USD";
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: Cents;
  closingBalanceCents: Cents;
  /** Money in and out as the statement totals them, when it prints totals. */
  statedTotals: { creditsCents: Cents; debitsCents: Cents } | null;
  rows: StatementRow[];
};

export type ParseFailure = {
  ok: false;
  reason: "unsupported" | "no-account" | "malformed";
  /** Last 4 digits of every account the statement covers, for the message. */
  accountsFound: string[];
  detail: string;
};

export type ParseResult =
  { ok: true; statement: ParsedStatement } | ParseFailure;
