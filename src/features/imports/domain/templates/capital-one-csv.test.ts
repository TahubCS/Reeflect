import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRecords } from "../csv-records";
import { parseCsvStatement } from "../parse";
import type { ParseResult, ParsedStatement } from "../statement";
import {
  detectCapitalOneCsv,
  exportDate,
  parseCapitalOneCsv,
} from "./capital-one-csv";

const fixture = (file: string) =>
  readRecords(
    readFileSync(
      new URL(`../../../../../tests/fixtures/csv/${file}`, import.meta.url),
      "utf8",
    ),
    "upload",
  )!;

const DEPOSIT_HEADER = [
  "Account Number",
  "Transaction Description",
  "Transaction Date",
  "Transaction Type",
  "Transaction Amount",
  "Balance",
];
const CARD_HEADER = [
  "Transaction Date",
  "Posted Date",
  "Card No.",
  "Description",
  "Category",
  "Debit",
  "Credit",
];

function statement(result: ParseResult): ParsedStatement {
  if (!result.ok) throw new Error(`expected a statement: ${result.detail}`);
  return result.statement;
}

const SEPTEMBER_ROWS = [
  ["2026-09-02", "PAYROLL ACME CO", 200000, 300000],
  ["2026-09-05", "GROCERY MART #12", -5421, 294579],
  ["2026-09-05", "COFFEE, TEA & MORE", -1250, 293329],
  ["2026-09-12", "RENT PAYMENT", -120000, 173329],
  ["2026-09-30", "Monthly Interest Paid", 81, 173410],
].map(([postedOn, description, amountCents, runningBalanceCents]) => ({
  postedOn,
  description,
  amountCents,
  runningBalanceCents,
}));

describe("detectCapitalOneCsv", () => {
  it("knows the 360 and card exports by their column names, in any order", () => {
    expect(detectCapitalOneCsv(DEPOSIT_HEADER)).toBe("deposit");
    expect(detectCapitalOneCsv(DEPOSIT_HEADER.toReversed())).toBe("deposit");
    expect(detectCapitalOneCsv(CARD_HEADER)).toBe("card");
    expect(
      detectCapitalOneCsv(CARD_HEADER.map((name) => name.toUpperCase())),
    ).toBe("card");
  });

  it("knows nothing else", () => {
    expect(detectCapitalOneCsv(["Date", "Description", "Amount"])).toBeNull();
    expect(detectCapitalOneCsv(DEPOSIT_HEADER.slice(0, 5))).toBeNull();
    expect(detectCapitalOneCsv([])).toBeNull();
  });
});

describe("exportDate", () => {
  it.each([
    ["09/05/26", "2026-09-05"],
    ["9/5/2026", "2026-09-05"],
    ["2026-09-05", "2026-09-05"],
    ["02/29/24", "2024-02-29"],
  ])("reads %s", (text, iso) => {
    expect(exportDate(text)).toBe(iso);
  });

  it.each(["02/30/26", "13/01/26", "2026-9-5", "Sept 5", "", "09/05/226"])(
    "refuses %j",
    (text) => {
      expect(exportDate(text)).toBeNull();
    },
  );
});

describe("parseCapitalOneCsv: 360 export", () => {
  it("reads the newest-first export oldest first, with balances worked out", () => {
    const parsed = statement(
      parseCapitalOneCsv(fixture("capital-one-360-normal.csv"), "1234"),
    );
    expect(parsed).toEqual({
      institution: "Capital One",
      productName: "360 account",
      accountTypes: ["checking", "savings"],
      accountLast4: "1234",
      currency: "USD",
      periodStart: "2026-09-02",
      periodEnd: "2026-09-30",
      openingBalanceCents: 100000,
      closingBalanceCents: 173410,
      statedTotals: null,
      rows: SEPTEMBER_ROWS,
    });
  });

  it("reads an oldest-first LF export with four-digit years the same way", () => {
    const parsed = statement(
      parseCapitalOneCsv(fixture("capital-one-360-lf.csv"), "1234"),
    );
    expect(parsed.rows).toEqual(SEPTEMBER_ROWS);
    expect(parsed.openingBalanceCents).toBe(100000);
  });

  it("reads only the chosen account's rows from an export of two", () => {
    const records = fixture("capital-one-360-two-accounts.csv");
    expect(statement(parseCapitalOneCsv(records, "1234")).rows).toEqual(
      SEPTEMBER_ROWS,
    );
    const savings = statement(parseCapitalOneCsv(records, "9876"));
    expect(savings.openingBalanceCents).toBe(30000);
    expect(savings.closingBalanceCents).toBe(80042);
  });

  it("puts rows in date order when the balances don't chain either way", () => {
    const parsed = statement(
      parseCapitalOneCsv(fixture("capital-one-360-off-by-a-cent.csv"), "1234"),
    );
    expect(parsed.rows.map((row) => row.postedOn)).toEqual([
      "2026-09-02",
      "2026-09-05",
      "2026-09-05",
      "2026-09-12",
      "2026-09-30",
    ]);
  });

  it("takes the sign from the transaction type, not the amount", () => {
    const parsed = statement(
      parseCapitalOneCsv(
        [
          DEPOSIT_HEADER,
          ["1234", "Refund", "09/01/26", "credit", "-5.00", "105.00"],
        ],
        "1234",
      ),
    );
    expect(parsed.rows[0]!.amountCents).toBe(500);
    expect(parsed.openingBalanceCents).toBe(10000);
  });

  it("keeps only the last 4 digits of a longer account number", () => {
    const parsed = statement(
      parseCapitalOneCsv(
        [DEPOSIT_HEADER, ["36001234", "Pay", "09/01/26", "Credit", "5", "5"]],
        null,
      ),
    );
    expect(parsed.accountLast4).toBe("1234");
  });
});

describe("parseCapitalOneCsv: card export", () => {
  it("reads debits as money out and credits as money in, with no balances", () => {
    const parsed = statement(
      parseCapitalOneCsv(fixture("capital-one-card.csv"), "5678"),
    );
    expect(parsed).toMatchObject({
      productName: "Credit card",
      accountTypes: ["credit_card"],
      accountLast4: "5678",
      periodStart: "2026-09-04",
      periodEnd: "2026-09-21",
      openingBalanceCents: null,
      closingBalanceCents: null,
    });
    expect(parsed.rows).toEqual([
      {
        postedOn: "2026-09-04",
        description: 'JOE\'S "BEST" DINER',
        amountCents: -1875,
        runningBalanceCents: null,
      },
      {
        postedOn: "2026-09-16",
        description: "CAPITAL ONE AUTOPAY PYMT",
        amountCents: 25000,
        runningBalanceCents: null,
      },
      {
        postedOn: "2026-09-21",
        description: "AMAZON.COM, INC",
        amountCents: -4399,
        runningBalanceCents: null,
      },
    ]);
  });

  it.each([
    ["both Debit and Credit", ["5.00", "5.00"]],
    ["neither Debit nor Credit", ["", ""]],
    ["a negative amount", ["-5.00", ""]],
  ])("refuses a row with %s", (_name, [debit, credit]) => {
    const result = parseCapitalOneCsv(
      [
        CARD_HEADER,
        ["2026-09-01", "2026-09-02", "5678", "Shop", "Other", debit!, credit!],
      ],
      "5678",
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "malformed",
      detail: "Line 2 of the CSV can't be read.",
    });
  });
});

describe("parseCapitalOneCsv: failures", () => {
  it("names the accounts it found when the chosen one isn't there", () => {
    expect(
      parseCapitalOneCsv(fixture("capital-one-360-two-accounts.csv"), "5555"),
    ).toEqual({
      ok: false,
      reason: "no-account",
      accountsFound: ["1234", "9876"],
      detail: "This CSV has no transactions for the chosen account.",
    });
  });

  it("asks for the last 4 digits when the export has several accounts", () => {
    expect(
      parseCapitalOneCsv(fixture("capital-one-360-two-accounts.csv"), null),
    ).toMatchObject({ ok: false, reason: "no-account" });
  });

  it("reads a single-account export when the account has no last 4 yet", () => {
    const parsed = statement(
      parseCapitalOneCsv(fixture("capital-one-360-normal.csv"), null),
    );
    expect(parsed.accountLast4).toBe("1234");
  });

  it("refuses an export with no transactions", () => {
    expect(parseCapitalOneCsv(fixture("empty.csv"), "1234")).toMatchObject({
      ok: false,
      reason: "malformed",
      detail: "The CSV has no transactions.",
    });
  });

  it.each([
    ["a bad date", ["1234", "Pay", "31/09/26", "Credit", "5.00", "5.00"]],
    ["a bad amount", ["1234", "Pay", "09/01/26", "Credit", "$5.00", "5.00"]],
    ["no balance", ["1234", "Pay", "09/01/26", "Credit", "5.00", ""]],
    ["an unknown type", ["1234", "Pay", "09/01/26", "Fee", "5.00", "5.00"]],
    ["no account number", ["", "Pay", "09/01/26", "Credit", "5.00", "5.00"]],
    ["missing fields", ["1234", "Pay"]],
  ])("refuses a 360 row with %s, naming its line", (_name, fields) => {
    expect(parseCapitalOneCsv([DEPOSIT_HEADER, fields], "1234")).toMatchObject({
      ok: false,
      reason: "malformed",
      detail: "Line 2 of the CSV can't be read.",
    });
  });
});

describe("parseCsvStatement", () => {
  it("sends Capital One exports to their template", () => {
    expect(parseCsvStatement(fixture("capital-one-card.csv"), "5678").ok).toBe(
      true,
    );
  });

  it("refuses other banks' exports clearly", () => {
    expect(parseCsvStatement(fixture("other-bank.csv"), "1234")).toEqual({
      ok: false,
      reason: "unsupported",
      accountsFound: [],
      detail:
        "Only Capital One CSV exports can be read for now: 360 checking and savings, and credit cards.",
    });
  });
});
