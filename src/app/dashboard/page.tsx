import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/features/auth/ui/sign-out-button";
import { CashflowDashboard } from "@/features/cashflow/ui/cashflow-dashboard";
import { getSession } from "@/lib/auth/session";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard" };

// Reads the session, so it must render inside the Suspense boundary below.
async function SignedInDashboard() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <>
      <div className={styles.account}>
        <span>Signed in as {session.user.email}</span>
        <SignOutButton />
      </div>
      <CashflowDashboard />
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={<p className={styles.loading}>Loading your calendar…</p>}
    >
      <SignedInDashboard />
    </Suspense>
  );
}
