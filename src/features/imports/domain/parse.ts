import type { ParseResult } from "./statement";
import { isCapitalOne, parseCapitalOne } from "./templates/capital-one";
import type { Line } from "./text";

// Picks the institution template for a statement (ADR-044). A statement no
// template recognizes fails clearly; nothing guesses at its layout.

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
