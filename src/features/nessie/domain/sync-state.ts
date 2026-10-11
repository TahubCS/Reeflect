// What the Sync now button shows after a sync. Pure and client-safe.
export type SyncSummary =
  | {
      status: "synced";
      accounts: number;
      added: number;
      updated: number;
      removed: number;
      nessieRecords: number;
      reeflectRows: number;
      /** Recurring Nessie bills now shown as recurring payments. */
      bills: number;
      ms: number;
    }
  | { status: "not set up" | "no accounts" | "unreachable" };

export type SyncState = { result: SyncSummary | null; at: string | null };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One sentence for the status line; numbers come from code (ADR-019). */
export function describeSync(result: SyncSummary): string {
  switch (result.status) {
    case "not set up":
      return "Capital One sandbox isn't set up on this server.";
    case "no accounts":
      return "No Capital One sandbox accounts are linked to this workspace.";
    case "unreachable":
      return "Couldn't reach Capital One. Showing the data from the last sync.";
    case "synced": {
      const changes =
        result.added + result.updated + result.removed === 0
          ? "No changes"
          : [
              result.added && `${result.added} new`,
              result.updated && `${result.updated} changed`,
              result.removed && `${result.removed} removed`,
            ]
              .filter(Boolean)
              .join(", ");
      return `${changes} from Capital One (${plural(result.accounts, "account")}, ${(result.ms / 1000).toFixed(1)} s). Nessie: ${plural(result.nessieRecords, "record")} · Reeflect: ${plural(result.reeflectRows, "row")}${result.bills > 0 ? ` · ${plural(result.bills, "recurring bill")}` : ""}.`;
    }
  }
}

/** Whether the header shows Sync, and when the last sync was. */
export type NessieStatus = {
  linked: boolean;
  /** ISO time of the last sync, or null before the first one. */
  lastSyncedAt: string | null;
  /** Editors and owners may sync; viewers see the time only. */
  canSync: boolean;
};

/** A few words for the header after Sync is pressed. */
export function describeSyncShort(result: SyncSummary): string {
  switch (result.status) {
    case "not set up":
      return "Capital One isn't set up here";
    case "no accounts":
      return "No Capital One accounts linked";
    case "unreachable":
      return "Couldn't reach Capital One";
    case "synced": {
      const changes = result.added + result.updated + result.removed;
      return changes === 0
        ? "Synced, no changes"
        : `Synced, ${plural(changes, "change")}`;
    }
  }
}

/** "Synced 5 min ago", from the last sync time and the time now. */
export function syncedAgo(lastSyncedAt: string | null, now: number): string {
  if (!lastSyncedAt) return "Not synced yet";
  const minutes = Math.floor((now - Date.parse(lastSyncedAt)) / 60_000);
  if (!Number.isFinite(minutes)) return "Not synced yet";
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${plural(hours, "hour")} ago`;
  return `Synced ${plural(Math.floor(hours / 24), "day")} ago`;
}
