import {
  type Cents,
  negate,
  parseStatementAmount,
  subtract,
} from "@/lib/money";
import type {
  ParseResult,
  StatementAccountType,
  StatementRow,
} from "../statement";
import type { Line } from "../text";

// Capital One 360 deposit statements (checking, savings, money market).
// Layout, from Capital One's sample eStatement:
//
//   Your 360 Savings Activity
//   Account: 12345678  Current Interest Rate: …
//   Activity               Date        Amount     Balance
//   Opening Balance        01/01/2013              $1,186.93
//   Monthly Interest Paid  01/31/2013  $2.49      $1,189.42
//   Closing Balance        03/31/2013              $1,194.17
//
// One statement can hold several accounts, each in its own "Activity"
// section; the import reads only the section for the target account.
// Columns are found from the header row's x positions, so a value is read
// from the column it sits under. Card statements have another layout and
// are not supported yet.

export const INSTITUTION = "Capital One";

const SECTION = /^Your (.+?) Activity$/;
const ACCOUNT = /Account:\s*(\d{4,17})\b/;
const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function isCapitalOne(lines: readonly Line[]): boolean {
  return lines.some((line) => /capital\s*one/i.test(line.text));
}

function accountTypes(productName: string): StatementAccountType[] {
  if (/checking/i.test(productName)) return ["checking"];
  if (/savings|money market/i.test(productName)) return ["savings"];
  return [];
}

function isoDate(text: string): string | null {
  const match = DATE.exec(text);
  if (!match) return null;
  const [, month, day, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const iso = date.toISOString().slice(0, 10);
  return iso === `${year}-${month}-${day}` ? iso : null;
}

type Columns = {
  activity: number;
  date: number;
  amount: number;
  balance: number;
};

function headerColumns(line: Line): Columns | null {
  const at = (name: string) =>
    line.cells.find((cell) => cell.text.toLowerCase() === name)?.x;
  const activity = at("activity");
  const date = at("date");
  const amount = at("amount");
  const balance = at("balance");
  if (
    activity === undefined ||
    date === undefined ||
    amount === undefined ||
    balance === undefined
  ) {
    return null;
  }
  return { activity, date, amount, balance };
}

type Section = { productName: string; last4: string; start: number };

function sections(lines: readonly Line[]): Section[] {
  const found: Section[] = [];
  for (const [index, line] of lines.entries()) {
    const title = SECTION.exec(line.text);
    if (!title) continue;
    const account = lines
      .slice(index + 1, index + 4)
      .map((next) => ACCOUNT.exec(next.text))
      .find(Boolean);
    if (account) {
      found.push({
        productName: title[1]!,
        last4: account[1]!.slice(-4),
        start: index,
      });
    }
  }
  return found;
}

type RowCells = {
  description: string;
  date: string | null;
  amount: Cents | null;
  balance: Cents | null;
  unreadable: boolean;
};

/**
 * Sorts a row's cells into the header's columns. A cell is a date or an
 * amount only when it reads as one and sits right of the midpoint between
 * its column and the one before, so a long description that runs toward
 * the date column stays a description. A cell in the amount or balance
 * area that is not an amount makes the row unreadable.
 */
function readRow(line: Line, columns: Columns): RowCells {
  const description: string[] = [];
  let date: string | null = null;
  let amount: Cents | null = null;
  let balance: Cents | null = null;
  let unreadable = false;
  const dateEdge = (columns.activity + columns.date) / 2;
  const moneyEdge = (columns.date + columns.amount) / 2;
  const balanceEdge = (columns.amount + columns.balance) / 2;
  for (const cell of line.cells) {
    if (cell.x >= moneyEdge) {
      const value = parseStatementAmount(cell.text);
      if (value === null) unreadable = true;
      else if (cell.x < balanceEdge) amount = value;
      else balance = value;
    } else if (cell.x >= dateEdge && isoDate(cell.text) !== null) {
      date = isoDate(cell.text);
    } else {
      description.push(cell.text);
    }
  }
  return {
    description: description.join(" ").trim(),
    date,
    amount,
    balance,
    unreadable,
  };
}

const fail = (
  reason: "no-account" | "malformed",
  accountsFound: string[],
  detail: string,
): ParseResult => ({ ok: false, reason, accountsFound, detail });

export function parseCapitalOne(
  lines: readonly Line[],
  targetLast4: string | null,
): ParseResult {
  const all = sections(lines);
  const accountsFound = all.map((section) => section.last4);
  if (all.length === 0) {
    return fail(
      "malformed",
      accountsFound,
      "No account activity was found in this statement.",
    );
  }
  const index = all.findIndex((section) => section.last4 === targetLast4);
  // With one account and no last 4 to match, read it; the identity check
  // then explains what is missing.
  const chosen =
    index >= 0
      ? all[index]!
      : targetLast4 === null && all.length === 1
        ? all[0]!
        : null;
  if (!chosen) {
    return fail(
      "no-account",
      accountsFound,
      "This statement has no activity for the chosen account.",
    );
  }
  const end = all[all.indexOf(chosen) + 1]?.start ?? lines.length;
  const body = lines.slice(chosen.start + 1, end);

  let columns: Columns | null = null;
  let opening: { date: string; balance: Cents } | null = null;
  let closing: { date: string; balance: Cents } | null = null;
  const rows: StatementRow[] = [];
  let previousBalance: Cents | null = null;

  for (const line of body) {
    // The header repeats at the top of each page of a long statement.
    const header = headerColumns(line);
    if (header) {
      columns = header;
      continue;
    }
    if (!columns || closing) continue;
    const row = readRow(line, columns);
    if (/^opening balance$/i.test(row.description)) {
      if (row.unreadable || !row.date || row.balance === null) {
        return fail(
          "malformed",
          accountsFound,
          "The opening balance can't be read.",
        );
      }
      opening = { date: row.date, balance: row.balance };
      previousBalance = row.balance;
      continue;
    }
    if (/^closing balance$/i.test(row.description)) {
      if (row.unreadable || !row.date || row.balance === null) {
        return fail(
          "malformed",
          accountsFound,
          "The closing balance can't be read.",
        );
      }
      closing = { date: row.date, balance: row.balance };
      continue;
    }
    // Anything without a date and an amount is page furniture, not a row.
    // A row dropped here cannot go unnoticed: reconciliation would fail.
    if (!row.date || row.amount === null) continue;
    if (row.unreadable || !opening) {
      return fail(
        "malformed",
        accountsFound,
        `A row on page ${line.page} can't be read.`,
      );
    }
    let amount = row.amount;
    // Some statements print withdrawals without a sign. When the printed
    // balance fell by exactly the amount, the row is money out.
    if (
      amount > 0 &&
      row.balance !== null &&
      previousBalance !== null &&
      subtract(row.balance, previousBalance) === negate(amount)
    ) {
      amount = negate(amount);
    }
    rows.push({
      postedOn: row.date,
      description: row.description,
      amountCents: amount,
      runningBalanceCents: row.balance,
    });
    if (row.balance !== null) previousBalance = row.balance;
  }

  if (!columns) {
    return fail(
      "malformed",
      accountsFound,
      "The activity table can't be found.",
    );
  }
  if (!opening || !closing) {
    return fail(
      "malformed",
      accountsFound,
      "The opening or closing balance is missing.",
    );
  }
  return {
    ok: true,
    statement: {
      institution: INSTITUTION,
      productName: chosen.productName,
      accountTypes: accountTypes(chosen.productName),
      accountLast4: chosen.last4,
      currency: "USD",
      periodStart: opening.date,
      periodEnd: closing.date,
      openingBalanceCents: opening.balance,
      closingBalanceCents: closing.balance,
      statedTotals: null,
      rows,
    },
  };
}
