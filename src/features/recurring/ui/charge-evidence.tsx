"use client";

import { useId, useState } from "react";
import { cents, formatSigned } from "@/lib/money";
import {
  chargeEvidence,
  describeEvidence,
  gapNote,
  longDate,
  shortDate,
} from "../domain/evidence";
import type { Charge } from "../domain/patterns";
import styles from "./recurring.module.css";

/**
 * The charges behind a recurring payment: their rhythm as a row of dots
 * with the days between them, and a button that lists each one. The words
 * under the button say the same as the dots, so the drawing is decorative.
 */
export function ChargeEvidence({
  charges,
  kind,
}: {
  charges: readonly Charge[];
  kind: "bill" | "subscription" | "income";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const evidence = chargeEvidence(charges);
  const noun = kind === "income" ? "deposit" : "charge";
  const count = evidence.steps.length;
  const label = `See ${count} matching ${count === 1 ? noun : `${noun}s`}`;

  return (
    <div className={styles.evidence}>
      {count > 1 ? (
        <ol className={styles.timeline} aria-hidden="true" data-kind={kind}>
          {evidence.steps.map((step) => (
            <li key={step.id} data-off={step.offPattern || undefined}>
              {step.gapDays !== null && (
                <span className={styles.gap}>{step.gapDays} d</span>
              )}
              <span className={styles.dot} />
              <span className={styles.when}>{shortDate(step.postedOn)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <button
        type="button"
        className={styles.evidenceButton}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>
          <strong>{open ? `Hide the ${noun}s` : label}</strong>
          <span className={styles.evidenceNote}>
            {describeEvidence(evidence)}
          </span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </button>
      <ul id={id} className={styles.charges} hidden={!open}>
        {[...evidence.steps].reverse().map((step) => (
          <li key={step.id}>
            <span>
              <time dateTime={step.postedOn}>{longDate(step.postedOn)}</time> ·{" "}
              {step.source}
            </span>
            <span>{formatSigned(cents(step.amountCents))}</span>
            <span
              className={styles.gapNote}
              data-off={step.offPattern || undefined}
            >
              {gapNote(step)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
