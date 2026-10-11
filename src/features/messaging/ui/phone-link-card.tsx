"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { Confirm } from "@/components/ui/confirm";
import { APP_NAME } from "@/config/app";
import { formatLinkCode } from "../domain/link-code";
import {
  approveLinkAction,
  createLinkCodeAction,
  disconnectAction,
  rejectLinkAction,
  setProactiveOptInAction,
} from "../server/actions";
import type { LinkState } from "../server/link";
import styles from "./phone-link-card.module.css";

const POLL_MS = 3000;

type Props = {
  workspaceId: string;
  /** The server's view of the link; refreshed after every action. */
  state: LinkState;
  /** The number to text, when there is a single one (ADR-051). */
  agentPhone: string | null;
};

/** A time in the reader's own time zone, which the server cannot know. */
function LocalTime({ iso, date = false }: { iso: string; date?: boolean }) {
  const value = new Date(iso);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {date
        ? value.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })
        : value.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
    </time>
  );
}

/**
 * Links a phone to the signed-in user (F-24). The plain code is held only
 * here, in memory: reload the page and it is gone, by design.
 */
export function PhoneLinkCard({ workspaceId, state, agentPhone }: Props) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  // The checkbox shows the new choice at once, then settles on the server's.
  const [optedIn, showOptedIn] = useOptimistic(
    state.status === "linked" && state.proactiveOptIn,
  );

  // While a code is out, ask the server whether a phone has texted it.
  const waiting = state.status === "code_active" || state.status === "pending";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, router]);

  const run = (action: () => Promise<string | null>) => {
    startTransition(async () => {
      try {
        setNotice(await action());
      } catch {
        setNotice("That did not work. Try again.");
      }
    });
  };

  const getCode = () =>
    run(async () => {
      const result = await createLinkCodeAction(workspaceId);
      if (!result.ok) return "A phone is already linked.";
      setCode(result.code);
      return null;
    });

  const approve = () =>
    run(async () => {
      setCode(null);
      const { linked, texted } = await approveLinkAction(workspaceId);
      if (!linked) return "That request is no longer valid. Get a new code.";
      return texted
        ? "Linked. We sent a text to your phone to confirm."
        : `Linked. Text ${APP_NAME} anything to start.`;
    });

  const reject = () =>
    run(async () => {
      setCode(null);
      const { texted } = await rejectLinkAction(workspaceId);
      return texted
        ? "Request refused. Nothing was linked, and we texted that phone to say so."
        : "Request refused. Nothing was linked.";
    });

  const disconnect = () =>
    run(async () => {
      const { texted } = await disconnectAction(workspaceId);
      return texted
        ? "Phone disconnected. We sent it a text to confirm."
        : "Phone disconnected.";
    });

  const setOptIn = (optIn: boolean) =>
    run(async () => {
      showOptedIn(optIn);
      await setProactiveOptInAction(workspaceId, optIn);
      return null;
    });

  const instruction = code ? `LINK ${formatLinkCode(code)}` : null;

  return (
    <section className={styles.card} aria-labelledby="messages-heading">
      <h2 id="messages-heading">Messages</h2>

      {/* Polling changes what is shown here, so the change is announced. */}
      <div aria-live="polite">
        {state.status === "none" && (
          <>
            <p className={styles.lede}>
              Link your iPhone to text {APP_NAME} about your money. Nothing is
              sent to a phone until you approve it here.
            </p>
            <button
              type="button"
              className={styles.primary}
              onClick={getCode}
              disabled={busy}
            >
              Connect iMessage
            </button>
          </>
        )}

        {state.status === "code_active" && instruction && code && (
          <>
            <p className={styles.lede}>
              Text this to {agentPhone ?? APP_NAME} from your iPhone:
            </p>
            <p className={styles.code}>{instruction}</p>
            <p className={styles.meta}>
              Valid until <LocalTime iso={state.expiresAt} />. Works once.
            </p>
            <div className={styles.actions}>
              {agentPhone && (
                <a
                  className={styles.primary}
                  href={`sms:${agentPhone}?&body=${encodeURIComponent(`LINK ${code}`)}`}
                >
                  Open Messages
                </a>
              )}
              <button
                type="button"
                className={styles.secondary}
                onClick={getCode}
                disabled={busy}
              >
                Get a new code
              </button>
            </div>
          </>
        )}

        {state.status === "code_active" && !code && (
          <>
            <p className={styles.lede}>
              Your code is hidden for safety. Get a new one to continue.
            </p>
            <button
              type="button"
              className={styles.primary}
              onClick={getCode}
              disabled={busy}
            >
              Get a new code
            </button>
          </>
        )}

        {state.status === "pending" && (
          <>
            <p className={styles.lede}>
              Link request from {state.handleLabel}. Approve only if it is
              yours.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={approve}
                disabled={busy}
              >
                Approve
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={reject}
                disabled={busy}
              >
                Not me
              </button>
            </div>
          </>
        )}

        {state.status === "linked" && (
          <>
            <p className={styles.lede}>
              Connected: {state.handleLabel}, since{" "}
              <LocalTime iso={state.linkedAt} date />.
            </p>
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={optedIn}
                onChange={(event) => setOptIn(event.target.checked)}
                disabled={busy}
              />
              <span>Text me about new subscriptions and bills</span>
            </label>
            <p className={styles.meta}>
              For extra privacy, set Show Previews to “When Unlocked” in your
              iPhone’s Notifications settings.
            </p>
            <div className={styles.actions}>
              <Confirm
                label="Disconnect"
                consequence="Your phone stops getting texts and can't log spending. To link it again you'll need a new code."
              >
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={disconnect}
                  disabled={busy}
                >
                  Confirm disconnect
                </button>
              </Confirm>
              <span className={styles.meta}>or text STOP</span>
            </div>
          </>
        )}
      </div>

      <p className={styles.notice} role="status">
        {notice}
      </p>
    </section>
  );
}
