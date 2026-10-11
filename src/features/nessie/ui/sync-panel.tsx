"use client";
import { useActionState, useEffect } from "react";
import { NAV_REFRESH_EVENT } from "@/config/nav";
import { type SyncState, describeSync } from "../domain/sync-state";
import styles from "./nessie.module.css";

type Props = {
  action: (previous: SyncState) => Promise<SyncState>;
  /** ISO time of the last sync, from the server. */
  lastSyncedAt: string | null;
  canSync: boolean;
};

const time = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});

/** Capital One sandbox status: where the data comes from, and Sync now. */
export function NessieSyncPanel({ action, lastSyncedAt, canSync }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    result: null,
    at: null,
  });
  const last = state.at ?? lastSyncedAt;
  // The header's counts and sync time read again after a sync here.
  useEffect(() => {
    if (state.at) window.dispatchEvent(new Event(NAV_REFRESH_EVENT));
  }, [state.at]);
  return (
    <section className={styles.panel} aria-labelledby="nessie-heading">
      <div className={styles.text}>
        <h2 id="nessie-heading">Capital One sandbox</h2>
        <p>
          These accounts are read from Capital One&rsquo;s Nessie API. It is the
          source of truth: Reeflect keeps a synced copy.
        </p>
        <p className={styles.meta}>
          {last ? (
            <>
              Last synced{" "}
              <time dateTime={last}>{time.format(new Date(last))}</time>
            </>
          ) : (
            "Not synced yet"
          )}
        </p>
        <p className={styles.status} role="status" aria-live="polite">
          {pending
            ? "Syncing with Capital One…"
            : state.result
              ? describeSync(state.result)
              : ""}
        </p>
      </div>
      {canSync && (
        <form action={formAction}>
          <button type="submit" className={styles.button} disabled={pending}>
            {pending ? "Syncing…" : "Sync now"}
          </button>
        </form>
      )}
    </section>
  );
}
