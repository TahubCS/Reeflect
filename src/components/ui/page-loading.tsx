import styles from "./page-loading.module.css";

/**
 * The fallback of a page's Suspense boundary. A page that reads the URL or
 * the session wraps that work in `<Suspense fallback={<PageLoading />}>`, so
 * a click from another page shows this at once instead of waiting on the
 * server (Next.js "instant navigation").
 */
export function PageLoading() {
  return <p className={styles.loading}>Loading…</p>;
}
