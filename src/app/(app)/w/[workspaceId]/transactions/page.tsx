import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { accountIdSchema, listAccounts } from "@/features/accounts";
import {
  CategorizationPanels,
  PAGE_SIZE,
  TransactionCategory,
  TransactionPagination,
  createRuleAction,
  deleteRuleAction,
  ensureCategories,
  getCategorizationPage,
  pageNumberSchema,
  renameCategoryAction,
  saveOverrideAction,
  updateRuleAction,
} from "@/features/categorization";
import { TransactionList, listTransactions } from "@/features/transactions";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { roleAtLeast } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Transactions" };

type Props = PageProps<"/w/[workspaceId]/transactions">;

// Reads the URL, the session and the transactions, so the page renders this
// inside a Suspense boundary.
async function Transactions({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const canEdit = roleAtLeast(access.role, "editor");
  if (canEdit) await ensureCategories(access.workspaceId);
  const [accounts, query] = await Promise.all([
    listAccounts(access.workspaceId),
    searchParams,
  ]);
  const requested = accountIdSchema.safeParse(query.account);
  const accountId =
    requested.success &&
    accounts.some((account) => account.id === requested.data)
      ? requested.data
      : null;
  const page = pageNumberSchema.parse(query.page ?? 1);
  const rows = await listTransactions(access.workspaceId, {
    accountId: accountId ?? undefined,
    limit: PAGE_SIZE + 1,
    offset: (page - 1) * PAGE_SIZE,
  });
  const transactions = rows.slice(0, PAGE_SIZE);
  const data = await getCategorizationPage(
    access.workspaceId,
    1,
    transactions.map((item) => item.id),
  );
  const categoryControls = Object.fromEntries(
    data.transactions.map((item) => [
      item.id,
      <TransactionCategory
        key={item.id}
        item={item}
        categories={data.categories}
        canEdit={canEdit}
        action={saveOverrideAction.bind(null, access.workspaceId)}
      />,
    ]),
  );
  return (
    <TransactionList
      workspaceId={access.workspaceId}
      transactions={transactions}
      accounts={accounts}
      accountId={accountId}
      canEdit={canEdit}
      truncated={false}
      categoryControls={categoryControls}
      pagination={
        <TransactionPagination
          workspaceId={access.workspaceId}
          accountId={accountId}
          page={page}
          hasNextPage={rows.length > PAGE_SIZE}
        />
      }
    >
      <CategorizationPanels
        categories={data.categories}
        rules={data.rules}
        canEdit={canEdit}
        createRuleAction={createRuleAction.bind(null, access.workspaceId)}
        updateRuleAction={updateRuleAction.bind(null, access.workspaceId)}
        deleteRuleAction={deleteRuleAction.bind(null, access.workspaceId)}
        renameCategoryAction={renameCategoryAction.bind(
          null,
          access.workspaceId,
        )}
      />
    </TransactionList>
  );
}

export default function TransactionsPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Transactions {...props} />
    </Suspense>
  );
}
