"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/config/nav";
import styles from "./app-nav.module.css";

/** The links in the signed-in header. The current page's link is marked. */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Pages">
      {NAV_ITEMS.map(({ href, label }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={styles.link}
            aria-current={current ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
