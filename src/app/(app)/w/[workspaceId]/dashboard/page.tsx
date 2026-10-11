import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { CashflowDashboard, loadDashboard } from "@/features/cashflow";

export const metadata: Metadata = { title: "Dashboard" };

type Props = PageProps<"/w/[workspaceId]/dashboard">;

// Reads the URL, the session and the workspace's money, so the page renders
// this inside a Suspense boundary.
async function Dashboard({ params }: Props) {
  const { workspaceId } = await params;
  return <CashflowDashboard {...await loadDashboard(workspaceId)} />;
}

export default function DashboardPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Dashboard {...props} />
    </Suspense>
  );
}
