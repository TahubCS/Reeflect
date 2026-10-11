import { type Cents, add, formatCents, subtract, sum } from "@/lib/money";
import { parseCsv } from "./csv";
import type { ParsedStatement, StatementAccountType } from "./statement";

// ADR-010's import guardrails for a parsed statement, plus the checks that
// the CSV kept in storage says exactly what the statement says (ADR-053).
// Every check reports in plain words; a `block` stops the commit. A file
// with no balances (a card's CSV export) skips the balance checks.

export type CheckOutcome = "pass" | "warn" | "block";

export type CheckId =
  | "identity"
  | "account-type"
  | "currency"
  | "reconciliation"
  | "running-balance"
  | "stated-totals"
  | "csv"
  | "duplicate-file"
  | "duplicate-rows"
  | "period"
  | "continuity";

export type Check = {
  id: CheckId;
  label: string;
  outcome: CheckOutcome;
  detail: string;
};

export type TargetAccount = {
  institutionName: string;
  maskLast4: string | null;
  type: StatementAccountType;
};

export type PreviousImport = {
  periodStart: string;
  periodEnd: string;
  /** Null for an import whose file had no balances. */
  closingBalanceCents: Cents | null;
};

export type CheckContext = {
  statement: ParsedStatement;
  csv: string;
  account: TargetAccount;
  duplicateFile: boolean;
  duplicateRows: number;
  previousImports: readonly PreviousImport[];
};

const TYPE_NAMES: Record<StatementAccountType, string> = {
  checking: "checking",
  savings: "savings",
  credit_card: "credit card",
  loan: "loan",
};

const day = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export function formatStatementDate(isoDate: string): string {
  return day.format(new Date(`${isoDate}T00:00:00Z`));
}

const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, "");

function sameInstitution(statement: string, account: string): boolean {
  const a = letters(statement);
  const b = letters(account);
  return a !== "" && b !== "" && (a.includes(b) || b.includes(a));
}

function identity({ statement, account }: CheckContext): Check {
  const label = "Account matches";
  const printed = `${statement.institution} ••${statement.accountLast4}`;
  if (account.maskLast4 === null) {
    return {
      id: "identity",
      label,
      outcome: "block",
      detail: `This statement is for ${printed}. Add the account's last 4 digits on the Accounts page, so imports can be checked against it.`,
    };
  }
  const held = `${account.institutionName} ••${account.maskLast4}`;
  if (
    !sameInstitution(statement.institution, account.institutionName) ||
    statement.accountLast4 !== account.maskLast4
  ) {
    return {
      id: "identity",
      label,
      outcome: "block",
      detail: `This statement is for ${printed}, but the chosen account is ${held}. Choose the matching account.`,
    };
  }
  return { id: "identity", label, outcome: "pass", detail: `${printed}.` };
}

function accountType({ statement, account }: CheckContext): Check {
  const label = "Account type matches";
  if (statement.accountTypes.length === 0) {
    return {
      id: "account-type",
      label,
      outcome: "block",
      detail: `"${statement.productName}" isn't a kind of account that can be imported yet.`,
    };
  }
  if (!statement.accountTypes.includes(account.type)) {
    const kinds = statement.accountTypes
      .map((type) => TYPE_NAMES[type])
      .join(" or ");
    return {
      id: "account-type",
      label,
      outcome: "block",
      detail: `This is a ${kinds} statement, and the chosen account is a ${TYPE_NAMES[account.type]} account.`,
    };
  }
  return {
    id: "account-type",
    label,
    outcome: "pass",
    detail: `${statement.productName}, a ${TYPE_NAMES[account.type]} account.`,
  };
}

function currency({ statement }: CheckContext): Check {
  return statement.currency === "USD"
    ? {
        id: "currency",
        label: "US dollars",
        outcome: "pass",
        detail: "Every amount is in US dollars.",
      }
    : {
        id: "currency",
        label: "US dollars",
        outcome: "block",
        detail: "Only statements in US dollars can be imported.",
      };
}

/** Opening balance plus every row equals the closing balance, to the cent. */
export function reconciliationDifference(
  openingBalanceCents: Cents,
  amounts: readonly Cents[],
  closingBalanceCents: Cents,
): Cents {
  return subtract(closingBalanceCents, add(openingBalanceCents, sum(amounts)));
}

/** The statement's balances, or null when the file has none (ADR-010). */
function balances(statement: ParsedStatement) {
  const { openingBalanceCents: opening, closingBalanceCents: closing } =
    statement;
  return opening === null || closing === null ? null : { opening, closing };
}

function reconciliation({ statement }: CheckContext): Check | null {
  const stated = balances(statement);
  if (!stated) return null;
  const label = "Balances add up";
  const amounts = statement.rows.map((row) => row.amountCents);
  const difference = reconciliationDifference(
    stated.opening,
    amounts,
    stated.closing,
  );
  const sentence = `Opening ${formatCents(stated.opening)}, plus ${statement.rows.length} ${statement.rows.length === 1 ? "transaction" : "transactions"} totalling ${formatCents(sum(amounts))}`;
  if (difference !== 0) {
    return {
      id: "reconciliation",
      label,
      outcome: "block",
      detail: `${sentence}, comes to ${formatCents(add(stated.opening, sum(amounts)))}, but the statement's closing balance is ${formatCents(stated.closing)}: a difference of ${formatCents(difference)}. Nothing will be imported from this file.`,
    };
  }
  return {
    id: "reconciliation",
    label,
    outcome: "pass",
    detail: `${sentence}, equals the closing balance of ${formatCents(stated.closing)}.`,
  };
}

function runningBalance({ statement }: CheckContext): Check | null {
  const stated = balances(statement);
  if (
    !stated ||
    statement.rows.every((row) => row.runningBalanceCents === null)
  ) {
    return null;
  }
  const label = "Each row's balance follows";
  let balance = stated.opening;
  for (const row of statement.rows) {
    balance = add(balance, row.amountCents);
    if (
      row.runningBalanceCents !== null &&
      row.runningBalanceCents !== balance
    ) {
      return {
        id: "running-balance",
        label,
        outcome: "block",
        detail: `After "${row.description}" on ${formatStatementDate(row.postedOn)} the statement shows ${formatCents(row.runningBalanceCents)}, but the rows before it add up to ${formatCents(balance)}.`,
      };
    }
    if (row.runningBalanceCents !== null) balance = row.runningBalanceCents;
  }
  return {
    id: "running-balance",
    label,
    outcome: "pass",
    detail: "Every printed balance equals the one before it plus the row.",
  };
}

function statedTotals({ statement }: CheckContext): Check | null {
  if (!statement.statedTotals) return null;
  const label = "Totals match the statement";
  const credits = sum(
    statement.rows.map((row) => row.amountCents).filter((amount) => amount > 0),
  );
  const debits = sum(
    statement.rows.map((row) => row.amountCents).filter((amount) => amount < 0),
  );
  const { creditsCents, debitsCents } = statement.statedTotals;
  if (credits !== creditsCents || debits !== debitsCents) {
    return {
      id: "stated-totals",
      label,
      outcome: "block",
      detail: `The rows come to ${formatCents(credits)} in and ${formatCents(debits)} out; the statement prints ${formatCents(creditsCents)} and ${formatCents(debitsCents)}.`,
    };
  }
  return {
    id: "stated-totals",
    label,
    outcome: "pass",
    detail: `${formatCents(credits)} in and ${formatCents(debits)} out, as printed.`,
  };
}

/** The CSV that will be stored reads back to exactly the statement's rows. */
function csvMatches({ statement, csv }: CheckContext): Check {
  const label = "Saved copy matches";
  const back = parseCsv(csv);
  const same =
    back.ok &&
    back.rows.length === statement.rows.length &&
    back.rows.every((row, index) => {
      const original = statement.rows[index]!;
      return (
        row.postedOn === original.postedOn &&
        row.description === original.description &&
        row.amountCents === original.amountCents &&
        row.runningBalanceCents === original.runningBalanceCents
      );
    });
  if (!same) {
    return {
      id: "csv",
      label,
      outcome: "block",
      detail: back.ok
        ? "The saved copy of the rows differs from the statement."
        : `The saved copy of the rows can't be read back: ${back.error}`,
    };
  }
  return {
    id: "csv",
    label,
    outcome: "pass",
    detail: `All ${statement.rows.length} rows read back from the saved copy exactly.`,
  };
}

function duplicateFile({ duplicateFile: seen }: CheckContext): Check {
  return seen
    ? {
        id: "duplicate-file",
        label: "Not imported before",
        outcome: "block",
        detail: "This exact file has already been imported to this account.",
      }
    : {
        id: "duplicate-file",
        label: "Not imported before",
        outcome: "pass",
        detail: "This file hasn't been imported to this account before.",
      };
}

function duplicateRows({
  statement,
  duplicateRows: count,
}: CheckContext): Check {
  const fresh = statement.rows.length - count;
  return {
    id: "duplicate-rows",
    label: "Transactions already here",
    outcome: "pass",
    detail:
      count === 0
        ? `All ${statement.rows.length} transactions are new.`
        : `${count} ${count === 1 ? "transaction is" : "transactions are"} already on this account and will be skipped; ${fresh} will be added.`,
  };
}

function period({ statement, previousImports }: CheckContext): Check {
  const label = "Statement period";
  const range = `${formatStatementDate(statement.periodStart)} to ${formatStatementDate(statement.periodEnd)}`;
  const overlap = previousImports.find(
    (earlier) =>
      earlier.periodStart <= statement.periodEnd &&
      earlier.periodEnd >= statement.periodStart,
  );
  if (overlap) {
    return {
      id: "period",
      label,
      outcome: "pass",
      detail: `${range}. This overlaps an earlier import (${formatStatementDate(overlap.periodStart)} to ${formatStatementDate(overlap.periodEnd)}); transactions already imported are skipped.`,
    };
  }
  const before = latestBefore(previousImports, statement.periodStart);
  if (before && nextDay(before.periodEnd) < statement.periodStart) {
    return {
      id: "period",
      label,
      outcome: "warn",
      detail: `${range}. The last import ended on ${formatStatementDate(before.periodEnd)}, so transactions in between are missing until that statement is imported too.`,
    };
  }
  return { id: "period", label, outcome: "pass", detail: `${range}.` };
}

function continuity({
  statement,
  previousImports,
}: CheckContext): Check | null {
  const stated = balances(statement);
  const before = latestBefore(previousImports, statement.periodStart);
  if (
    !stated ||
    !before ||
    before.closingBalanceCents === null ||
    nextDay(before.periodEnd) < statement.periodStart
  ) {
    return null;
  }
  const label = "Follows the last statement";
  return before.closingBalanceCents === stated.opening
    ? {
        id: "continuity",
        label,
        outcome: "pass",
        detail: `It opens at ${formatCents(stated.opening)}, where the last one closed.`,
      }
    : {
        id: "continuity",
        label,
        outcome: "warn",
        detail: `It opens at ${formatCents(stated.opening)}, but the last statement closed at ${formatCents(before.closingBalanceCents)}.`,
      };
}

function latestBefore(
  imports: readonly PreviousImport[],
  start: string,
): PreviousImport | undefined {
  return imports
    .filter((earlier) => earlier.periodEnd < start)
    .toSorted((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
}

function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function runChecks(context: CheckContext): Check[] {
  return [
    identity(context),
    accountType(context),
    currency(context),
    reconciliation(context),
    runningBalance(context),
    statedTotals(context),
    csvMatches(context),
    duplicateFile(context),
    duplicateRows(context),
    period(context),
    continuity(context),
  ].filter((check): check is Check => check !== null);
}

export function isBlocked(checks: readonly Check[]): boolean {
  return checks.some((check) => check.outcome === "block");
}
