import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { AppNav, AppNavFallback } from "@/components/ui/app-nav";
import { Logo } from "@/components/ui/logo";
import { APP_NAME } from "@/config/app";
import { SignOutButton } from "@/features/auth/ui/sign-out-button";
import {
  NessieNavSync,
  nessieStatusAction,
  syncNessieAction,
} from "@/features/nessie";
import { suggestionCountAction } from "@/features/recurring";
import { getSession } from "@/lib/auth/session";
import styles from "./layout.module.css";

// Both components below read the session, and the nav and Sync read the
// URL, so each renders inside a Suspense boundary (Cache Components). The
// wordmark is static.

// The numbers on the header's links. Each action authorizes on its own.
const NAV_COUNTS = { subscriptions: suggestionCountAction };

async function Account() {
  const session = await getSession();
  if (!session) return null;

  return (
    <>
      <span className={styles.email}>Signed in as {session.user.email}</span>
      <SignOutButton />
    </>
  );
}

/**
 * Sends signed-out visitors to sign in. This gates the pages in this group;
 * a page that loads data must still authorize in its own server code
 * (ARCH-04).
 */
async function SignedIn({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return children;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      {/* Two rows on the landing page's night band: the wordmark, Capital
          One sync and the account above; the page tabs below. */}
      <header className={styles.top}>
        <div className={styles.bar}>
          <Link href="/dashboard" className={styles.wordmark}>
            <Logo size={26} />
            {APP_NAME}
          </Link>
          <div className={styles.sync}>
            <Suspense fallback={null}>
              <NessieNavSync
                statusAction={nessieStatusAction}
                syncAction={syncNessieAction}
              />
            </Suspense>
          </div>
          <div className={styles.account}>
            <Suspense fallback={null}>
              <Account />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<AppNavFallback />}>
          <AppNav counts={NAV_COUNTS} />
        </Suspense>
      </header>
      <div id="content">
        <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
          <SignedIn>{children}</SignedIn>
        </Suspense>
      </div>
    </>
  );
}
