import type { StatementRow } from "./statement";
import { normalizeDescription } from "./normalize";

/**
 * ADR-010's duplicate key for imported rows: account + date + amount +
 * normalized description + occurrence index. The index counts identical
 * rows within the import, so two $4 coffees on one day stay two rows, and
 * importing an overlapping statement again finds both.
 */
export function fingerprints(
  accountId: string,
  rows: readonly StatementRow[],
): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = `${row.postedOn}|${row.amountCents}|${normalizeDescription(row.description)}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return `stmt:${accountId}|${key}|${occurrence}`;
  });
}
