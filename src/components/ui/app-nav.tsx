"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  NAV_ITEMS,
  NAV_REFRESH_EVENT,
  type NavSegment,
  navCountLabel,
  navCountText,
  navHref,
} from "@/config/nav";
import styles from "./app-nav.module.css";

/**
 * Server actions, one per link that shows a number: each reads how many
 * things on that page wait for the person, and authorizes on its own.
 */
export type NavCountActions = Partial<
  Record<NavSegment, (workspaceId: string) => Promise<number>>
>;

type Counts = Partial<Record<NavSegment, number>>;

function NavLinks({
  workspaceId,
  pathname,
  counts = {},
}: {
  workspaceId?: string;
  pathname?: string;
  counts?: Counts;
}) {
  return (
    <nav className={styles.nav} aria-label="Pages">
      {NAV_ITEMS.map(({ segment, label }) => {
        const href = navHref(segment, workspaceId);
        const current =
          pathname !== undefined &&
          (pathname === href || pathname.startsWith(`${href}/`));
        const count = counts[segment] ?? 0;
        return (
          <Link
            key={segment}
            href={href}
            className={styles.link}
            aria-current={current ? "page" : undefined}
            // The number is read with the label, so it is never colour alone.
            aria-label={
              count > 0
                ? `${label}, ${navCountLabel(segment, count)}`
                : undefined
            }
          >
            {label}
            {count > 0 && (
              <span className={styles.count} aria-hidden="true">
                {navCountText(count)}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Reads each link's number for the workspace in the URL: again on every
 * page change, and when NAV_REFRESH_EVENT says something changed. A failed
 * read leaves the link without a number.
 */
function useCounts(
  workspaceId: string | undefined,
  pathname: string,
  actions: NavCountActions | undefined,
): Counts {
  const [read, setRead] = useState<{ workspaceId: string; counts: Counts }>();

  useEffect(() => {
    if (!workspaceId || !actions) return;
    let live = true;
    const load = () => {
      for (const [segment, action] of Object.entries(actions)) {
        action(workspaceId).then(
          (count) => {
            if (!live) return;
            setRead((previous) => ({
              workspaceId,
              counts: {
                ...(previous?.workspaceId === workspaceId
                  ? previous.counts
                  : {}),
                [segment]: count,
              },
            }));
          },
          () => {},
        );
      }
    };
    load();
    window.addEventListener(NAV_REFRESH_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(NAV_REFRESH_EVENT, load);
    };
  }, [workspaceId, pathname, actions]);

  return read && read.workspaceId === workspaceId ? read.counts : {};
}

/**
 * The links in the signed-in header, inside the workspace in the URL. The
 * current page's link is marked, and a link can carry a number (`counts`).
 * It reads the URL, so render it inside a Suspense boundary with
 * `AppNavFallback` as the fallback.
 */
export function AppNav({ counts }: { counts?: NavCountActions }) {
  const pathname = usePathname();
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const read = useCounts(workspaceId, pathname, counts);

  return (
    <NavLinks workspaceId={workspaceId} pathname={pathname} counts={read} />
  );
}

/** The same links before the URL is known: they go through the redirects. */
export function AppNavFallback() {
  return <NavLinks />;
}
