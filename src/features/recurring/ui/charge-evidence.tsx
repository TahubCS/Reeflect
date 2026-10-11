"use client";

import { useId, useState } from "react";
import { cents, formatSigned } from "@/lib/money";
import {
  chargeEvidence,
  describeEvidence,
  gapNote,
  longDate,
} from "../domain/evidence";
import type { Charge } from "../domain/patterns";
import styles from "./recurring.module.css";

/** Charges listed before "Show all". */
const LEDGER_ROWS = 3;

/**
 * The charges behind a recurring payment as ledger rows, newest first: the
 * rhythm in words above, the days since the one before under each date,
 * and the latest few shown until "Show all".
 */
export function ChargeEvidence({
  charges,
  kind,
}: {
  charges: readonly Charge[];
  kind: "bill" | "subscription" | "income";
}) {
  const [all, setAll] = useState(false);
  const id = useId();
  const evidence = chargeEvidence(charges);
  const noun = kind === "income" ? "deposits" : "charges";
  const steps = [...evidence.steps].reverse();
  const shown = all ? steps : steps.slice(0, LEDGER_ROWS);

  return (
    <div className={styles.evidence}>
      <p className={styles.evidenceHead}>
        <strong>Matching {noun}</strong>{" "}
        <span className={styles.evidenceNote}>
          · {describeEvidence(evidence)}
        </span>
      </p>
      <ul id={id} className={styles.charges}>
        {shown.map((step) => (
          <li key={step.id}>
            <span>
              <time dateTime={step.postedOn}>{longDate(step.postedOn)}</time> ·{" "}
              {step.source}
            </span>
            <span className={styles.chargeAmount}>
              {formatSigned(cents(step.amountCents))}
            </span>
            <span
              className={styles.gapNote}
              data-off={step.offPattern || undefined}
            >
              {gapNote(step)}
            </span>
          </li>
        ))}
      </ul>
      {steps.length > LEDGER_ROWS ? (
        <button
          type="button"
          className={styles.showAll}
          aria-expanded={all}
          aria-controls={id}
          onClick={() => setAll(!all)}
        >
          {all ? "Show fewer" : `Show all ${steps.length} ${noun}`}
        </button>
      ) : null}
    </div>
  );
}
