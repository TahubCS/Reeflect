"use client";

import { useState, useTransition } from "react";
import { APP_NAME } from "@/config/app";
import {
  DAILY_WRITES,
  type PanelState,
  type PanelView,
  type WriteResult,
} from "../domain/panel";
import styles from "./summary-panel.module.css";

type Props = {
  workspaceId: string;
  /** What the page loaded: today's written summary, or the code-built one. */
  initial: PanelState;
  writeAction: (workspaceId: string) => Promise<WriteResult | null>;
};

const NOT_NOW = "That didn't work just now. Try again in a moment.";
const NONE_LEFT = `You've used today's ${DAILY_WRITES} Gemini summaries. You can ask again tomorrow.`;

function sourceLine(view: PanelView): string {
  if (view.source === "code") return `Built by ${APP_NAME} from your accounts.`;
  const at = view.writtenAt ? ` at ${view.writtenAt}` : "";
  return `Written by Gemini${at}, around figures ${APP_NAME} worked out.`;
}

/** What to say after a click that did not produce a new summary. */
function noteFor(result: WriteResult): string {
  if (result.outcome !== "no_answer") return "";
  return result.view.source === "model"
    ? "Gemini didn't answer just now, so the earlier summary is still here."
    : `Gemini didn't answer just now, so this is ${APP_NAME}'s own summary. The figures are the same.`;
}

/**
 * The dashboard's summary panel (F-15, ADR-045, ADR-068). It opens with
 * today's summary if Gemini wrote one, else the one code built; the button
 * asks Gemini to write it, a few times a day at most. Every figure is one
 * code worked out and put in. Colour carries nothing here: who wrote it,
 * whether a model answered and how many are left are said in words.
 */
export function SummaryPanel({ workspaceId, initial, writeAction }: Props) {
  // What a click produced, kept only while the page's figures are the ones
  // it was written from: a refresh brings a new `initial` and drops it.
  const [asked, setAsked] = useState<{
    from: PanelState;
    state: PanelState;
    note: string;
  }>();
  const [pending, startWriting] = useTransition();
  const current = asked?.from === initial ? asked : undefined;
  const { view, remaining } = current?.state ?? initial;

  const write = () =>
    startWriting(async () => {
      try {
        const result = await writeAction(workspaceId);
        setAsked({
          from: initial,
          state: result ?? initial,
          note: result ? noteFor(result) : "",
        });
      } catch {
        setAsked({ from: initial, state: { view, remaining }, note: NOT_NOW });
      }
    });

  return (
    <section className={styles.panel} aria-labelledby="summary-heading">
      <div className={styles.head}>
        <h2 id="summary-heading">Where you stand</h2>
        <button
          type="button"
          className={styles.write}
          onClick={write}
          disabled={pending || remaining === 0}
        >
          {pending
            ? "Writing…"
            : view.source === "model"
              ? "Write it again"
              : "Write it with Gemini"}
        </button>
      </div>
      <div role="status" aria-live="polite" aria-busy={pending}>
        <p className={styles.summary}>{view.summary}</p>
        {view.suggestions.length > 0 && (
          <>
            <h3 className={styles.subhead}>Worth a look</h3>
            <ul className={styles.suggestions}>
              {view.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          </>
        )}
        <p className={styles.source}>
          {current?.note ? `${current.note} ` : ""}
          {sourceLine(view)}{" "}
          {remaining === 0
            ? NONE_LEFT
            : `${remaining} of ${DAILY_WRITES} Gemini summaries left today.`}
        </p>
      </div>
    </section>
  );
}
