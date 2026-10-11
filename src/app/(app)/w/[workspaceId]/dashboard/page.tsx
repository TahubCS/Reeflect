import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { CashflowDashboard, loadDashboard } from "@/features/cashflow";
import {
  SummaryPanel,
  loadSummaryPanel,
  writeSummaryAction,
} from "@/features/summary";

export const metadata: Metadata = { title: "Dashboard" };

type Props = PageProps<"/w/[workspaceId]/dashboard">;

// The summary panel (F-15) reads its own figures, so it has a boundary of
// its own: the calendar never waits for it. Nothing shows without accounts.
async function Summary({ workspaceId }: { workspaceId: string }) {
  const initial = await loadSummaryPanel(workspaceId);
  if (initial === null) return null;
  return (
    <SummaryPanel
      workspaceId={workspaceId}
      initial={initial}
      writeAction={writeSummaryAction}
    />
  );
}

// Reads the URL, the session and the workspace's money, so the page renders
// this inside a Suspense boundary.
async function Dashboard({ params }: Props) {
  const { workspaceId } = await params;
  return (
    <CashflowDashboard
      {...await loadDashboard(workspaceId)}
      summaryPanel={
        <Suspense fallback={null}>
          <Summary workspaceId={workspaceId} />
        </Suspense>
      }
    />
  );
}

export default function DashboardPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Dashboard {...props} />
    </Suspense>
  );
}
