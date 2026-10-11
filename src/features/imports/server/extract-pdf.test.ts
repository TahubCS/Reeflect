import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import {
  FIXTURES,
  type FixtureAccount,
  closingBalance,
} from "../../../../tests/fixtures/pdf/specs";
import { isBlocked, runChecks } from "../domain/checks";
import { toCsv } from "../domain/csv";
import { parseStatement } from "../domain/parse";
import type { StatementRow } from "../domain/statement";
import { toLines } from "../domain/text";
import { extractPdfText } from "./extract-pdf";

// The whole read path on the synthetic fixture PDFs (TEST-08): extract the
// text layer, pick the template, parse, run the checks.

const fixture = (file: string) =>
  new Uint8Array(
    readFileSync(
      new URL(`../../../../tests/fixtures/pdf/${file}`, import.meta.url),
    ),
  );

const spec = (file: string) => FIXTURES.find((f) => f.file === file)!;

const iso = (date: string) =>
  `${date.slice(6)}-${date.slice(0, 2)}-${date.slice(3, 5)}`;

function expectedRows(account: FixtureAccount): StatementRow[] {
  let balance = account.opening;
  return account.rows.map((row) => {
    balance += row.amount;
    return {
      postedOn: iso(row.date),
      description: row.description,
      amountCents: cents(row.amount),
      runningBalanceCents: cents(balance),
    };
  });
}

async function read(file: string, last4: string | null) {
  const extraction = await extractPdfText(fixture(file));
  if (!extraction.ok) throw new Error(extraction.problem);
  return parseStatement(toLines(extraction.items), last4);
}

function checksFor(
  file: string,
  statement: Parameters<typeof runChecks>[0]["statement"],
) {
  const account = spec(file).accounts.find((a) =>
    a.number.endsWith(statement.accountLast4),
  )!;
  return runChecks({
    statement,
    csv: toCsv(statement.rows),
    account: {
      institutionName: "Capital One",
      maskLast4: account.number.slice(-4),
      type: statement.accountType ?? "checking",
    },
    duplicateFile: false,
    duplicateRows: 0,
    previousImports: [],
  });
}

describe("Capital One fixtures", () => {
  it("reads a normal statement exactly and passes every check", async () => {
    const account = spec("capital-one-normal.pdf").accounts[0]!;
    const result = await read("capital-one-normal.pdf", "1234");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.statement).toMatchObject({
      institution: "Capital One",
      productName: "360 Checking",
      accountType: "checking",
      accountLast4: "1234",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      openingBalanceCents: 194000,
      closingBalanceCents: closingBalance(account),
    });
    expect(result.statement.rows).toEqual(expectedRows(account));
    const checks = checksFor("capital-one-normal.pdf", result.statement);
    expect(isBlocked(checks)).toBe(false);
  });

  it("reads a statement with no transactions", async () => {
    const result = await read("capital-one-empty.pdf", "5678");
    expect(result.ok && result.statement.rows).toEqual([]);
    if (result.ok)
      expect(
        isBlocked(checksFor("capital-one-empty.pdf", result.statement)),
      ).toBe(false);
  });

  it("follows a long account across pages and reads only the chosen account", async () => {
    const [checking, savings] = spec("capital-one-multipage.pdf").accounts;
    const first = await read("capital-one-multipage.pdf", "1234");
    expect(first.ok && first.statement.rows).toEqual(expectedRows(checking!));
    const second = await read("capital-one-multipage.pdf", "5678");
    expect(second.ok && second.statement.rows).toEqual(expectedRows(savings!));
    expect(second.ok && second.statement.accountType).toBe("savings");
  });

  it("blocks the statement that is off by a cent and shows the difference", async () => {
    const result = await read("capital-one-off-by-a-cent.pdf", "1234");
    if (!result.ok) throw new Error("expected a parse");
    const checks = checksFor("capital-one-off-by-a-cent.pdf", result.statement);
    const reconciliation = checks.find(
      (check) => check.id === "reconciliation",
    )!;
    expect(reconciliation.outcome).toBe("block");
    expect(reconciliation.detail).toContain("a difference of $0.01");
  });

  it("reads withdrawals printed without a minus sign as money out", async () => {
    const account = spec("capital-one-unsigned-debits.pdf").accounts[0]!;
    const result = await read("capital-one-unsigned-debits.pdf", "1234");
    expect(result.ok && result.statement.rows).toEqual(expectedRows(account));
  });

  it("names the accounts a statement covers when the chosen one isn't there", async () => {
    const result = await read("capital-one-multipage.pdf", "9999");
    expect(result).toMatchObject({
      ok: false,
      reason: "no-account",
      accountsFound: ["1234", "5678"],
    });
  });
});

describe("files that can't be read", () => {
  it("fails clearly for another bank", async () => {
    expect(await read("other-bank.pdf", "1234")).toMatchObject({
      ok: false,
      reason: "unsupported",
    });
  });

  it("reports a scan with no text layer", async () => {
    expect(await extractPdfText(fixture("image-only.pdf"))).toEqual({
      ok: false,
      problem: "no-text",
    });
  });

  it("reports bytes that aren't a PDF it can open", async () => {
    const broken = new TextEncoder().encode("%PDF-1.7\nnot really a pdf");
    expect(await extractPdfText(broken)).toEqual({
      ok: false,
      problem: "unreadable",
    });
  });
});
