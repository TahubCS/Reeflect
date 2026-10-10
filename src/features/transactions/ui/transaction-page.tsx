import type { ReactNode } from "react";
import styles from "./transactions.module.css";

/** The frame of the add and edit pages: a heading, an optional lede, the form. */
export function TransactionPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <h1>{title}</h1>
      {lede && <p className={styles.lede}>{lede}</p>}
      {children}
    </main>
  );
}
