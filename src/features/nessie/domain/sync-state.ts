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
