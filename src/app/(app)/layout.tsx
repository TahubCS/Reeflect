import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { AppNav, AppNavFallback } from "@/components/ui/app-nav";
import { APP_NAME } from "@/config/app";
import { SignOutButton } from "@/features/auth/ui/sign-out-button";
import { getSession } from "@/lib/auth/session";
import styles from "./layout.module.css";

// Both components below read the session, and the nav reads the URL, so
// each renders inside a Suspense boundary (Cache Components). The wordmark
// is static.

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
      <header className={styles.top}>
        <div className={styles.bar}>
          <Link href="/dashboard" className={styles.wordmark}>
            {APP_NAME}
          </Link>
          <Suspense fallback={<AppNavFallback />}>
            <AppNav />
          </Suspense>
          <div className={styles.account}>
            <Suspense fallback={null}>
              <Account />
            </Suspense>
          </div>
        </div>
      </header>
      <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
        <SignedIn>{children}</SignedIn>
      </Suspense>
    </>
  );
}
