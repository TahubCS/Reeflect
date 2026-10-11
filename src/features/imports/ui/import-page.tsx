import type { ReactNode } from "react";
import styles from "./imports.module.css";

/** The frame of the import page: a heading, a lede, then the step shown. */
export function ImportPage({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <h1>Import</h1>
      <p className={styles.lede}>
        Upload a bank statement to add its transactions to one of your accounts.
        It’s read by code, checked against the account and its own balances, and
        shown to you before anything is added.
      </p>
      {children}
    </main>
  );
}
