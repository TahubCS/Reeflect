import type { ParseResult } from "./statement";
import { isCapitalOne, parseCapitalOne } from "./templates/capital-one";
import {
  detectCapitalOneCsv,
  parseCapitalOneCsv,
} from "./templates/capital-one-csv";
import type { Line } from "./text";

// Picks the institution template for a statement (ADR-044, ADR-054). A
// statement no template recognizes fails clearly; nothing guesses at its
// layout or its columns.

export function parseStatement(
  lines: readonly Line[],
  targetLast4: string | null,
): ParseResult {
  if (isCapitalOne(lines)) return parseCapitalOne(lines, targetLast4);
  return {
    ok: false,
    reason: "unsupported",
    accountsFound: [],
    detail: "Only Capital One 360 statements can be read for now.",
  };
}

/** Reads a CSV export's records; the header row says whose export it is. */
export function parseCsvStatement(
  records: readonly string[][],
  targetLast4: string | null,
): ParseResult {
  if (detectCapitalOneCsv(records[0] ?? [])) {
    return parseCapitalOneCsv(records, targetLast4);
  }
  return {
    ok: false,
    reason: "unsupported",
    accountsFound: [],
    detail:
      "Only Capital One CSV exports can be read for now: 360 checking and savings, and credit cards.",
  };
}
