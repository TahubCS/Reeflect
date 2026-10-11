import type { ReactNode } from "react";
import styles from "./confirm.module.css";

type Props = {
  /** What the action does, e.g. "Remove budget". Opens the confirmation. */
  label: string;
  /** One sentence on what happens and what can't be undone. */
  consequence: string;
  /** The button that does it, labelled "Confirm …". */
  children: ReactNode;
};

/**
 * An action that deletes or disconnects something, behind one more click:
 * the first names it, the panel says what happens, the button inside does
 * it. The same shape as Recurring's "Remove tracking".
 */
export function Confirm({ label, consequence, children }: Props) {
  return (
    <details className={styles.confirm}>
      <summary>{label}</summary>
      <p className={styles.consequence}>{consequence}</p>
      {children}
    </details>
  );
}
