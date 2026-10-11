import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { accountIdSchema, listAccounts } from "@/features/accounts";
import {
  TransactionView,
  VIEW_ROWS,
  listTransactions,
} from "@/features/transactions";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Transactions, view only" };

type Props = PageProps<"/w/[workspaceId]/transactions/view">;

// Reads the URL, the session and the transactions, so the page renders this
// inside a Suspense boundary.
async function View({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const [accounts, query] = await Promise.all([
    listAccounts(access.workspaceId),
    searchParams,
  ]);
  const requested = accountIdSchema.safeParse(query.account);
  const account = requested.success
    ? accounts.find((item) => item.id === requested.data)
    : undefined;
  const rows = await listTransactions(access.workspaceId, {
    accountId: account?.id,
    limit: VIEW_ROWS + 1,
  });
  return (
    <TransactionView
      workspaceId={access.workspaceId}
      transactions={rows.slice(0, VIEW_ROWS)}
      accountName={account?.nickname ?? null}
      truncated={rows.length > VIEW_ROWS}
    />
  );
}

export default function TransactionViewPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <View {...props} />
    </Suspense>
  );
}
