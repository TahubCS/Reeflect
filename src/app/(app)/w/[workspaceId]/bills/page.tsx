import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { BillsPage, loadBills } from "@/features/bills";

export const metadata: Metadata = { title: "Bills" };

type Props = PageProps<"/w/[workspaceId]/bills">;
async function WorkspaceBills({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const data = await loadBills(workspaceId, await searchParams);
  return (
    <BillsPage
      key={`${data.workspaceId}:${data.query.accountId ?? "list"}:${data.query.merchant ?? ""}:${data.query.cycle ?? ""}`}
      data={data}
    />
  );
}
export default function BillsRoute(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <WorkspaceBills {...props} />
    </Suspense>
  );
}
