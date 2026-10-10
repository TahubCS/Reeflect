"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { NAV_ITEMS, navHref } from "@/config/nav";
import styles from "./app-nav.module.css";

function NavLinks({
  workspaceId,
  pathname,
}: {
  workspaceId?: string;
  pathname?: string;
}) {
  return (
    <nav className={styles.nav} aria-label="Pages">
      {NAV_ITEMS.map(({ segment, label }) => {
        const href = navHref(segment, workspaceId);
        const current =
          pathname !== undefined &&
          (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link
            key={segment}
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

/**
 * The links in the signed-in header, inside the workspace in the URL. The
 * current page's link is marked. It reads the URL, so render it inside a
 * Suspense boundary with `AppNavFallback` as the fallback.
 */
export function AppNav() {
  const pathname = usePathname();
  const { workspaceId } = useParams<{ workspaceId?: string }>();

  return <NavLinks workspaceId={workspaceId} pathname={pathname} />;
}

/** The same links before the URL is known: they go through the redirects. */
export function AppNavFallback() {
  return <NavLinks />;
}
