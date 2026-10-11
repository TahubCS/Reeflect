"use client";

import { useState, useTransition } from "react";
import { APP_NAME } from "@/config/app";
import type { PanelView } from "../domain/panel";
import styles from "./summary-panel.module.css";

type Props = {
  workspaceId: string;
  /** The summary built by code, which shows before anyone asks a model. */
  initial: PanelView;
  writeAction: (workspaceId: string) => Promise<PanelView | null>;
};

const SOURCE: Record<PanelView["source"], string> = {
  model: `Written by Gemini, around figures ${APP_NAME} worked out.`,
  code: `Built by ${APP_NAME} from your accounts.`,
};

const NO_ANSWER = `Gemini didn't answer just now, so this is ${APP_NAME}'s own summary. The figures are the same.`;
const NOT_NOW = "That didn't work just now. Try again in a moment.";

/**
 * The dashboard's summary panel (F-15, ADR-045). It opens with the summary
 * code built; the button asks Gemini to write it, and every figure in the
 * result is still one code worked out and put in. Colour carries nothing
 * here: who wrote it, and whether a model answered, are said in words.
 */
export function SummaryPanel({ workspaceId, initial, writeAction }: Props) {
  // What a click produced, kept only while the page's figures are the ones
  // it was written from: a refresh brings a new `initial` and drops it.
  const [asked, setAsked] = useState<{
    from: PanelView;
    view: PanelView;
    note: string;
  }>();
  const [pending, startWriting] = useTransition();
  const current = asked?.from === initial ? asked : undefined;
  const view = current?.view ?? initial;

  const write = () =>
    startWriting(async () => {
      try {
        const written = await writeAction(workspaceId);
        setAsked({
          from: initial,
          view: written ?? initial,
          note: written?.source === "model" ? "" : NO_ANSWER,
        });
      } catch {
        setAsked({ from: initial, view, note: NOT_NOW });
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
          disabled={pending}
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
          {SOURCE[view.source]}
        </p>
      </div>
    </section>
  );
}
