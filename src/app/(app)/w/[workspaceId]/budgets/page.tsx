import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { BudgetsPage, loadBudgets } from "@/features/budgets";

export const metadata: Metadata = { title: "Budgets" };

type Props = PageProps<"/w/[workspaceId]/budgets">;
async function MonthlyBudgets({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const query = await searchParams;
  const data = await loadBudgets(workspaceId, query.month);
  return <BudgetsPage key={`${data.workspaceId}:${data.month}`} data={data} />;
}
export default function BudgetsRoute(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <MonthlyBudgets {...props} />
    </Suspense>
  );
}
