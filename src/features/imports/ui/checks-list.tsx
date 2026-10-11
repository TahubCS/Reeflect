import type { Check, CheckOutcome } from "../domain/checks";
import styles from "./imports.module.css";

// Every outcome is spelled out in words; the coloured edge only repeats it.
const OUTCOME_TEXT: Record<CheckOutcome, string> = {
  pass: "Passed",
  warn: "Worth a look",
  block: "Stops the import",
};

export function ChecksList({ checks }: { checks: readonly Check[] }) {
  return (
    <ul className={styles.checks} aria-label="Checks">
      {checks.map((check) => (
        <li
          key={check.id}
          className={styles.check}
          data-outcome={check.outcome}
        >
          <span className={styles.outcome}>{OUTCOME_TEXT[check.outcome]}</span>
          <span className={styles.checkLabel}>{check.label}</span>
          <span className={styles.checkDetail}>{check.detail}</span>
        </li>
      ))}
    </ul>
  );
}
