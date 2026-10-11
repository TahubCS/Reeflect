import type { ReactNode } from "react";
import styles from "./auth.module.css";

/** An emailed link that no longer works, and what to do instead. */
export function LinkProblem({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  /** The way forward, usually one link. */
  children: ReactNode;
}) {
  return (
    <section className={styles.card} aria-labelledby="link-problem-title">
      <h1 id="link-problem-title">{title}</h1>
      <p className={styles.lede}>{message}</p>
      <p className={styles.aside}>{children}</p>
    </section>
  );
}
