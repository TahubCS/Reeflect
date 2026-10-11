import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn, listAccounts } from "@/features/accounts";
import {
  TransactionForm,
  TransactionPage,
  createTransactionAction,
} from "@/features/transactions";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Add a transaction" };

type Props = PageProps<"/w/[workspaceId]/transactions/new">;

// Reads the URL, the session and the accounts, so the page renders this
// inside a Suspense boundary.
async function NewTransaction({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "editor",
  );
  const accounts = await listAccounts(access.workspaceId);
  const list = `/w/${access.workspaceId}/transactions`;
  if (accounts.length === 0) redirect(list);

  // Start on the account the list was showing, if it is one of ours.
  const { account } = await searchParams;
  const chosen = accounts.find((a) => a.id === account)?.id ?? accounts[0]!.id;
  const today = isoDateIn(new Date(), DEFAULT_TIME_ZONE);

  return (
    <TransactionPage
      title="Add a transaction"
      lede="Something you bought, paid or were paid, on one of your accounts."
    >
      <TransactionForm
        action={createTransactionAction.bind(null, access.workspaceId)}
        initial={{
          accountId: chosen,
          postedOn: today,
          direction: "out",
          amount: "",
          description: "",
          pending: "",
          transfer: "",
        }}
        accounts={accounts.map(({ id, nickname, type }) => ({
          id,
          nickname,
          type,
        }))}
        ledgerEditable
        today={today}
        submitLabel="Add transaction"
        busyLabel="Adding…"
        cancelHref={chosen === account ? `${list}?account=${chosen}` : list}
      />
    </TransactionPage>
  );
}

export default function NewTransactionPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewTransaction {...props} />
    </Suspense>
  );
}
