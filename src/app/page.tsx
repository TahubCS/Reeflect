import Link from "next/link";
import { APP_NAME } from "@/config/app";
import styles from "./page.module.css";

const POINTS = [
  {
    title: "One plain answer",
    text: "A single sentence says what you can spend each day until payday, with the sum behind it.",
  },
  {
    title: "See what's coming",
    text: "Paydays, bills and subscriptions sit on the days they happen, so nothing arrives as a surprise.",
  },
  {
    title: "Numbers you can trust",
    text: "Every figure is worked out from your own transactions, to the cent.",
  },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <p className={styles.wordmark}>{APP_NAME}</p>
        <nav className={styles.nav} aria-label="Account">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up" className={styles.navPrimary}>
            Create account
          </Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero}>
          <h1>Know what you can spend each day until payday.</h1>
          <p className={styles.lede}>
            {APP_NAME} lays your month out as a calendar: what has come in, what
            is going out, and what is yours to spend.
          </p>
          <div className={styles.actions}>
            <Link href="/sign-up" className={styles.primary}>
              Create your account
            </Link>
            <Link href="/sign-in" className={styles.secondary}>
              I already have one
            </Link>
          </div>
        </section>

        <ul className={styles.points}>
          {POINTS.map((point) => (
            <li key={point.title}>
              <h2>{point.title}</h2>
              <p>{point.text}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer>
        {APP_NAME} only reads and displays your money. It never moves it.
      </footer>
    </div>
  );
}
