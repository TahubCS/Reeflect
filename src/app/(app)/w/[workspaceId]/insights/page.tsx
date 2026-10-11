import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { InsightsPage, getInsights } from "@/features/insights/server";

export const metadata: Metadata = { title: "Insights" };

type Props = PageProps<"/w/[workspaceId]/insights">;

// Reads the URL, the session and the workspace, so the page renders this
// inside a Suspense boundary (HO-033).
async function Insights({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const view = await getInsights(workspaceId, await searchParams);
  return <InsightsPage workspaceId={workspaceId} view={view} />;
}

export default function InsightsRoute(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Insights {...props} />
    </Suspense>
  );
}
