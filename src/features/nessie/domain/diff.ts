// What a sync must change so our rows match Nessie (the source of truth).
// Pure: rows are matched by external id.
import type { SyncedRow } from "./map";

export type StoredRow = Omit<SyncedRow, "fingerprint" | "categoryKey"> & {
  id: string;
};

export type SyncPlan = {
  add: SyncedRow[];
  update: { id: string; row: SyncedRow }[];
  /** Our row ids whose record is gone from Nessie. */
  remove: string[];
};

const FIELDS = [
  "postedOn",
  "amountCents",
  "descriptionRaw",
  "status",
  "isTransfer",
  "transferPairId",
] as const;

export function planSync(
  stored: readonly StoredRow[],
  fetched: readonly SyncedRow[],
): SyncPlan {
  const byExternal = new Map(stored.map((s) => [s.externalId, s]));
  const plan: SyncPlan = { add: [], update: [], remove: [] };
  const seen = new Set<string>();
  for (const row of fetched) {
    seen.add(row.externalId);
    const existing = byExternal.get(row.externalId);
    if (!existing) plan.add.push(row);
    else if (FIELDS.some((f) => existing[f] !== row[f]))
      plan.update.push({ id: existing.id, row });
  }
  for (const s of stored) if (!seen.has(s.externalId)) plan.remove.push(s.id);
  return plan;
}
