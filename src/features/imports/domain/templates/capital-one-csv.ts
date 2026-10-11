import {
  type Cents,
  add,
  negate,
  parseExportAmount,
  subtract,
} from "@/lib/money";
import type { ParseResult, StatementRow } from "../statement";
import { INSTITUTION } from "./capital-one";

// Capital One's CSV exports (ADR-054), read by code with built-in formats:
//
//   360 checking and savings:
//     Account Number, Transaction Description, Transaction Date,
//     Transaction Type (Debit or Credit), Transaction Amount, Balance
//   Credit card:
//     Transaction Date, Posted Date, Card No., Description, Category,
//     Debit, Credit
//
// Columns are found by name in any order. Amounts are unsigned in the file;
// the sign comes from the type column (360) or from which of Debit and
// Credit holds the amount (card). A 360 export has a balance after every
// row, so the opening and closing balances are worked out from it; a card
// export has no balances at all. Rows are emitted oldest first.

export type CapitalOneCsvFormat = "deposit" | "card";

const DEPOSIT = {
  account: "accountnumber",
  description: "transactiondescription",
  date: "transactiondate",
  type: "transactiontype",
  amount: "transactionamount",
  balance: "balance",
} as const;

const CARD = {
  account: "cardno",
  description: "description",
  date: "posteddate",
  debit: "debit",
  credit: "credit",
} as const;

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function detectCapitalOneCsv(
  header: readonly string[],
): CapitalOneCsvFormat | null {
  const names = new Set(header.map(key));
  const has = (columns: Record<string, string>) =>
    Object.values(columns).every((name) => names.has(name));
  if (has(DEPOSIT)) return "deposit";
  if (has(CARD)) return "card";
  return null;
}

const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `MM/DD/YY`, `MM/DD/YYYY` or `YYYY-MM-DD` as `YYYY-MM-DD`, if a real day. */
export function exportDate(text: string): string | null {
  const trimmed = text.trim();
  let year: number;
  let month: number;
  let day: number;
  const us = US_DATE.exec(trimmed);
  const iso = ISO_DATE.exec(trimmed);
  if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
    year = us[3]!.length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** The last 4 digits of an account or card number; the rest is dropped. */
function last4(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

const fail = (
  reason: "no-account" | "malformed",
  accountsFound: string[],
  detail: string,
): ParseResult => ({ ok: false, reason, accountsFound, detail });

type Read = { last4: string; row: StatementRow };

/** Oldest first; same-day rows keep the order the bank lists them in. */
function chronological(rows: StatementRow[]): StatementRow[] {
  const first = rows[0];
  const last = rows.at(-1);
  const ordered =
    first && last && first.postedOn > last.postedOn ? rows.toReversed() : rows;
  return ordered.toSorted((a, b) => a.postedOn.localeCompare(b.postedOn));
}

/** Every row's balance is the one before it plus the row. */
function chains(rows: readonly StatementRow[]): boolean {
  return rows.every((row, index) => {
    if (index === 0) return true;
    const before = rows[index - 1]!.runningBalanceCents;
    return (
      before !== null &&
      row.runningBalanceCents === add(before, row.amountCents)
    );
  });
}

/**
 * The 360 export lists newest first. The balance chain decides the order;
 * if neither direction chains, rows go by date and the running-balance
 * check reports where it breaks.
 */
function depositOrder(rows: StatementRow[]): StatementRow[] {
  if (chains(rows)) return rows;
  const reversed = rows.toReversed();
  if (chains(reversed)) return reversed;
  return chronological(rows);
}

function readDeposit(
  fields: readonly string[],
  at: (name: string) => number,
): Read | null {
  const field = (name: string) => fields[at(name)]?.trim() ?? "";
  const account = last4(field(DEPOSIT.account));
  const postedOn = exportDate(field(DEPOSIT.date));
  const amount = parseExportAmount(field(DEPOSIT.amount));
  const balance = parseExportAmount(field(DEPOSIT.balance));
  const type = field(DEPOSIT.type).toLowerCase();
  if (
    !account ||
    !postedOn ||
    amount === null ||
    balance === null ||
    (type !== "debit" && type !== "credit")
  ) {
    return null;
  }
  const size = amount < 0 ? negate(amount) : amount;
  return {
    last4: account,
    row: {
      postedOn,
      description: field(DEPOSIT.description),
      amountCents: type === "debit" ? negate(size) : size,
      runningBalanceCents: balance,
    },
  };
}

function readCard(
  fields: readonly string[],
  at: (name: string) => number,
): Read | null {
  const field = (name: string) => fields[at(name)]?.trim() ?? "";
  const account = last4(field(CARD.account));
  const postedOn = exportDate(field(CARD.date));
  const debit = field(CARD.debit);
  const credit = field(CARD.credit);
  // Exactly one of the two holds the amount.
  if (!account || !postedOn || (debit === "") === (credit === "")) return null;
  const amount = parseExportAmount(debit === "" ? credit : debit);
  if (amount === null || amount < 0) return null;
  return {
    last4: account,
    row: {
      postedOn,
      description: field(CARD.description),
      // A purchase is money out of the card account (ADR-008).
      amountCents: debit === "" ? amount : negate(amount),
      runningBalanceCents: null,
    },
  };
}

/**
 * Reads the export's rows for the target account. Like a PDF statement
 * that covers several accounts, only the chosen account's rows are read.
 */
export function parseCapitalOneCsv(
  records: readonly string[][],
  targetLast4: string | null,
): ParseResult {
  const [header = [], ...body] = records;
  const format = detectCapitalOneCsv(header);
  if (!format) {
    return fail("malformed", [], "The CSV's columns aren't the expected ones.");
  }
  const columns = header.map(key);
  const at = (name: string) => columns.indexOf(name);
  const read = format === "deposit" ? readDeposit : readCard;

  const all: Read[] = [];
  for (const [index, fields] of body.entries()) {
    const parsed = read(fields, at);
    if (!parsed) {
      return fail(
        "malformed",
        [...new Set(all.map((entry) => entry.last4))],
        `Line ${index + 2} of the CSV can't be read.`,
      );
    }
    all.push(parsed);
  }
  const accountsFound = [...new Set(all.map((entry) => entry.last4))];
  if (all.length === 0) {
    return fail("malformed", accountsFound, "The CSV has no transactions.");
  }
  // With one account and no last 4 to match, read it; the identity check
  // then explains what is missing.
  const chosen = accountsFound.includes(targetLast4 ?? "")
    ? targetLast4!
    : targetLast4 === null && accountsFound.length === 1
      ? accountsFound[0]!
      : null;
  if (!chosen) {
    return fail(
      "no-account",
      accountsFound,
      "This CSV has no transactions for the chosen account.",
    );
  }
  const mine = all
    .filter((entry) => entry.last4 === chosen)
    .map((entry) => entry.row);
  const rows = format === "deposit" ? depositOrder(mine) : chronological(mine);
  const dates = rows.map((row) => row.postedOn).toSorted();

  let openingBalanceCents: Cents | null = null;
  let closingBalanceCents: Cents | null = null;
  if (format === "deposit") {
    const first = rows[0]!;
    // Every 360 row was read with a balance.
    openingBalanceCents = subtract(
      first.runningBalanceCents!,
      first.amountCents,
    );
    closingBalanceCents = rows.at(-1)!.runningBalanceCents;
  }
  return {
    ok: true,
    statement: {
      institution: INSTITUTION,
      productName: format === "deposit" ? "360 account" : "Credit card",
      accountTypes:
        format === "deposit" ? ["checking", "savings"] : ["credit_card"],
      accountLast4: chosen,
      currency: "USD",
      periodStart: dates[0]!,
      periodEnd: dates.at(-1)!,
      openingBalanceCents,
      closingBalanceCents,
      statedTotals: null,
      rows,
    },
  };
}
