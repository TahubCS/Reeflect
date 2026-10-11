"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { NAV_REFRESH_EVENT } from "@/config/nav";
import {
  type NessieStatus,
  type SyncState,
  describeSyncShort,
  syncedAgo,
} from "../domain/sync-state";
import styles from "./nessie.module.css";

type Props = {
  statusAction: (workspaceId: string) => Promise<NessieStatus>;
  syncAction: (workspaceId: string) => Promise<SyncState>;
};

/**
 * Sync with Capital One from the header (ADR-033), for the workspace in the
 * URL. Shows nothing until that workspace has Nessie accounts; viewers see
 * the last sync time without the button. Render inside a Suspense boundary:
 * it reads the URL.
 */
export function NessieNavSync({ statusAction, syncAction }: Props) {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const [status, setStatus] = useState<{
    workspaceId: string;
    value: NessieStatus;
  }>();
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [pending, startSync] = useTransition();

  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    statusAction(workspaceId).then(
      (value) => live && setStatus({ workspaceId, value }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [workspaceId, statusAction]);

  // "Synced 5 min ago" moves on by itself.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // A result shows for a while, then the time since the sync comes back.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 8_000);
    return () => clearTimeout(timer);
  }, [message]);

  const current =
    status && status.workspaceId === workspaceId ? status.value : undefined;
  if (!workspaceId || !current?.linked) return null;

  const sync = () =>
    startSync(async () => {
      try {
        const state = await syncAction(workspaceId);
        if (state.result) setMessage(describeSyncShort(state.result));
        if (state.result?.status === "synced" && state.at) {
          const at = state.at;
          setStatus({ workspaceId, value: { ...current, lastSyncedAt: at } });
          setNow(Date.now());
        }
      } catch {
        setMessage("Couldn't sync. Try again.");
      }
      window.dispatchEvent(new Event(NAV_REFRESH_EVENT));
    });

  return (
    <div className={styles.navSync}>
      <span className={styles.navSyncText} role="status" aria-live="polite">
        {pending
          ? "Syncing with Capital One…"
          : message || syncedAgo(current.lastSyncedAt, now)}
      </span>
      {current.canSync && (
        <button
          type="button"
          className={styles.navSyncButton}
          onClick={sync}
          disabled={pending}
          aria-label="Sync with Capital One"
          data-pending={pending || undefined}
        >
          <span className={styles.navSyncIcon} aria-hidden="true">
            ↻
          </span>
          Sync
        </button>
      )}
    </div>
  );
}
