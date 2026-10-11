import { type Cents, absolute, sum } from "@/lib/money";
import type { Check } from "./checks";
import type { StatementRow } from "./statement";

// What the import page shows about a statement, and the states its forms
// return. Every figure is computed here, on the server, so the client only
// formats (ADR-042).

export type StatementSummary = {
  institution: string;
  last4: string;
  productName: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: Cents;
  closingBalanceCents: Cents;
  moneyInCents: Cents;
  moneyOutCents: Cents;
  rowCount: number;
};

export function summarize(
  facts: Omit<StatementSummary, "moneyInCents" | "moneyOutCents" | "rowCount">,
  rows: readonly StatementRow[],
): StatementSummary {
  const amounts = rows.map((row) => row.amountCents);
  return {
    ...facts,
    moneyInCents: sum(amounts.filter((amount) => amount > 0)),
    moneyOutCents: absolute(sum(amounts.filter((amount) => amount < 0))),
    rowCount: rows.length,
  };
}

export type PreviewFormState = {
  problem?: string;
  blocked?: { summary: StatementSummary; checks: Check[] };
  accountId?: string;
};

export type CommitFormState = { problem?: string };
