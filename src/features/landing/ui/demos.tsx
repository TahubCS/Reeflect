"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "@/config/app";
import { formatCents, formatSigned } from "@/lib/money";
import {
  CHAT,
  SAMPLE,
  STEP_MS,
  TODAY_ENTRIES,
  type TodayTotals,
  chartDrawing,
  easeOutCubic,
  entryShown,
  litStage,
  messageShown,
  sameTotals,
  threadShown,
  todayTotals,
  tweenTotals,
  typingShown,
} from "../domain/demo";
import { useDemoStep } from "./demo-clock";
import styles from "./landing.module.css";

/** Covers the hero's balance line at the start of a loop, then slides away. */
export function ChartCurtain() {
  const step = useDemoStep();
  return (
    <div
      aria-hidden="true"
      className={styles.curtain}
      data-drawing={chartDrawing(step)}
    />
  );
}

/** Slides the shown totals to the new ones over one step. */
function useTweenedTotals(target: TodayTotals): TodayTotals {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (sameTotals(from, target)) return;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / STEP_MS);
      const next = tweenTotals(from, target, easeOutCubic(progress));
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

export function TodayCard() {
  const step = useDemoStep();
  const target = useMemo(() => todayTotals(step), [step]);
  const totals = useTweenedTotals(target);

  return (
    <div className={styles.todayCard}>
      <div className={styles.todayHead}>
        <span className={styles.mistSoft}>Today</span>
        <span className={styles.todayDate}>{SAMPLE.todayLong}</span>
      </div>
      <dl className={styles.todayTotals}>
        <div>
          <dt>Money in</dt>
          <dd>{formatCents(totals.moneyIn)}</dd>
        </div>
        <div>
          <dt>Money out</dt>
          <dd>{formatCents(totals.moneyOut)}</dd>
        </div>
        <div>
          <dt>Balance after</dt>
          <dd>{formatCents(totals.balanceAfter)}</dd>
        </div>
      </dl>
      <ul className={styles.todayEntries}>
        {TODAY_ENTRIES.map((entry) => (
          <li key={entry.name} data-shown={entryShown(entry, step)}>
            {entry.amount > 0 ? (
              <svg
                aria-hidden="true"
                className={styles.markIn}
                width="12"
                height="10"
                viewBox="0 0 12 10"
              >
                <path d="M6 0l6 10H0z" />
              </svg>
            ) : (
              <span aria-hidden="true" className={styles.markOut} />
            )}
            <span className={styles.entryText}>
              <span className={styles.entryName}>{entry.name}</span>
              <span className={styles.mistSoft}>{entry.note}</span>
            </span>
            <span
              className={
                entry.amount > 0 ? styles.entryAmountIn : styles.entryAmount
              }
            >
              {formatSigned(entry.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChatDemo() {
  const step = useDemoStep();

  return (
    <figure className={styles.chat}>
      <figcaption className="sr-only">
        An example conversation with {APP_NAME}
      </figcaption>
      <ol className={styles.thread} data-shown={threadShown(step)}>
        {CHAT.map((message) => (
          <li
            key={message.text}
            className={styles.slot}
            data-shown={messageShown(message, step)}
          >
            <p
              className={
                message.from === "app" ? styles.bubbleApp : styles.bubbleYou
              }
            >
              <span className="sr-only">
                {message.from === "app" ? `${APP_NAME}: ` : "You: "}
              </span>
              {message.text}
            </p>
          </li>
        ))}
        <li
          aria-hidden="true"
          className={styles.slot}
          data-shown={typingShown(step)}
        >
          <span className={styles.typing}>
            <span />
            <span />
            <span />
          </span>
        </li>
      </ol>
    </figure>
  );
}

/** One stage of the pipeline; it lights up while the clock is on it. */
export function PipelineStage({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  const step = useDemoStep();
  return (
    <li className={styles.stage} data-lit={litStage(step) === index}>
      {children}
    </li>
  );
}
