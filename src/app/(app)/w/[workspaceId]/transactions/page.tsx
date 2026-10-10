import type { Metadata } from "next";
import { accountIdSchema, listAccounts } from "@/features/accounts";
import {
  LIST_LIMIT,
  TransactionList,
  listTransactions,
} from "@/features/transactions";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { roleAtLeast } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({
  params,
  searchParams,
}: PageProps<"/w/[workspaceId]/transactions">) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const accounts = await listAccounts(access.workspaceId);
  // Only one of this workspace's own accounts narrows the list; anything
  // else shows every account.
  const requested = accountIdSchema.safeParse((await searchParams).account);
  const accountId =
    requested.success && accounts.some((a) => a.id === requested.data)
      ? requested.data
      : null;
  const transactions = await listTransactions(access.workspaceId, {
    accountId: accountId ?? undefined,
  });

  return (
    <TransactionList
      workspaceId={access.workspaceId}
      transactions={transactions}
      accounts={accounts}
      accountId={accountId}
      truncated={transactions.length === LIST_LIMIT}
      canEdit={roleAtLeast(access.role, "editor")}
    />
  );
}
