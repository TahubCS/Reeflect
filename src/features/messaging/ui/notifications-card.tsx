"use client";

import { useState, useTransition } from "react";
import { APP_NAME } from "@/config/app";
import {
  type QuietHours,
  formatQuietHours,
  toTimeInput,
} from "../domain/quiet-hours";
import { setQuietHoursAction } from "../server/actions";
import styles from "./notifications-card.module.css";
import card from "./phone-link-card.module.css";

type Props = {
  workspaceId: string;
  /** The saved quiet hours, or the defaults; refreshed after saving. */
  hours: QuietHours;
};

const ERRORS = {
  invalid: "Choose a start and an end time.",
  same: "Start and end must be different times.",
} as const;

/** Settings → Notifications: quiet hours (F-33, ADR-038). */
export function NotificationsCard({ workspaceId, hours }: Props) {
  const [start, setStart] = useState(toTimeInput(hours.startMinute));
  const [end, setEnd] = useState(toTimeInput(hours.endMinute));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await setQuietHoursAction(workspaceId, start, end);
        setNotice(result.ok ? "Quiet hours saved." : ERRORS[result.error]);
      } catch {
        setNotice("That did not work. Try again.");
      }
    });
  };

  return (
    <section className={card.card} aria-labelledby="notifications-heading">
      <h2 id="notifications-heading">Notifications</h2>
      <p className={card.lede}>
        Quiet hours: <strong>{formatQuietHours(hours)}</strong>, Eastern time.
        {` ${APP_NAME}`} won’t text you first during them; anything waiting is
        sent when they end. Replies to your own texts still come straight away.
      </p>

      <form className={styles.form} onSubmit={save}>
        <label className={styles.field}>
          <span>Start</span>
          <input
            type="time"
            name="start"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span>End</span>
          <input
            type="time"
            name="end"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            required
          />
        </label>
        <button type="submit" className={card.primary} disabled={busy}>
          {busy ? "Saving…" : "Save quiet hours"}
        </button>
      </form>
      <p className={card.meta}>You can also text “quiet hours 11pm to 7am”.</p>

      <p className={card.notice} role="status">
        {notice}
      </p>
    </section>
  );
}
