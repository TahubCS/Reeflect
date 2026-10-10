import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/config/app";
import styles from "./layout.module.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link href="/" className={styles.wordmark}>
          {APP_NAME}
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
