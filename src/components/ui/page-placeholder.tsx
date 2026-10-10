import styles from "./page-placeholder.module.css";

type Props = {
  title: string;
  /** One sentence on what the page will do for the user. */
  purpose: string;
  /** Feature ids from docs/PROJECT.md section 5, e.g. "F-05, F-06". */
  features: string;
};

/**
 * The body of a page that has not been built yet. Whoever owns the feature
 * replaces it with the real page.
 */
export function PagePlaceholder({ title, purpose, features }: Props) {
  return (
    <main className={styles.page}>
      <h1>{title}</h1>
      <p className={styles.purpose}>{purpose}</p>
      <p className={styles.note}>Not built yet. This page is for {features}.</p>
    </main>
  );
}
