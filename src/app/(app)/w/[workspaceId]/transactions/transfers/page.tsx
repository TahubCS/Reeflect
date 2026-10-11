import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import {
  TransferReviewPage,
  loadTransferReview,
  reviewTransferAction,
} from "@/features/transfers";
export const metadata: Metadata = { title: "Review transfers" };
type Props = PageProps<"/w/[workspaceId]/transactions/transfers">;
async function Review({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const data = await loadTransferReview(workspaceId, await searchParams);
  return (
    <TransferReviewPage
      key={`${data.workspaceId}:${JSON.stringify(data.query)}`}
      data={data}
      action={reviewTransferAction.bind(null, data.workspaceId)}
    />
  );
}
export default function TransfersRoute(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Review {...props} />
    </Suspense>
  );
}
