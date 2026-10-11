import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn, listAccounts } from "@/features/accounts";
import {
  DeleteTransaction,
  TransactionForm,
  TransactionPage,
  deleteTransactionAction,
  formValues,
  formatDay,
  getTransaction,
  transactionIdSchema,
  updateTransactionAction,
} from "@/features/transactions";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import { formatSigned } from "@/lib/money";

export const metadata: Metadata = { title: "Edit transaction" };

const SOURCE_NAMES = {
  manual: "typed in",
  text: "logged by text",
  csv: "imported from a CSV file",
  pdf: "imported from a PDF statement",
  plaid: "synced from your bank",
  nessie: "synced from the Capital One sandbox",
  synthetic: "made as sample data",
} as const;

type Props = PageProps<"/w/[workspaceId]/transactions/[transactionId]">;

// Reads the URL, the session and the transaction, so the page renders this
// inside a Suspense boundary.
async function EditTransaction({ params }: Props) {
  const { workspaceId, transactionId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "editor",
  );
  const id = transactionIdSchema.safeParse(transactionId);
  if (!id.success) notFound();
  const transaction = await getTransaction(access.workspaceId, id.data);
  if (!transaction) notFound();
  const accounts = await listAccounts(access.workspaceId);

  return (
    <TransactionPage title={`Edit ${transaction.description}`}>
      <TransactionForm
        action={updateTransactionAction.bind(
          null,
          access.workspaceId,
          transaction.id,
        )}
        initial={formValues(transaction)}
        accounts={accounts.map(({ id, nickname, type }) => ({
          id,
          nickname,
          type,
        }))}
        ledgerEditable={
          transaction.editableInFull && transaction.transferPairId === null
        }
        paired={transaction.transferPairId !== null}
        fixedSummary={`${formatSigned(transaction.amountCents)} on ${transaction.accountNickname}, ${formatDay(transaction.postedOn)}. ${transaction.transferPairId !== null ? "Remove pairing in Review transfers before changing financial details or its transfer label." : `This transaction was ${SOURCE_NAMES[transaction.source]}, so its account, date and amount stay as they came.`}`}
        today={isoDateIn(new Date(), DEFAULT_TIME_ZONE)}
        submitLabel="Save changes"
        busyLabel="Saving…"
        cancelHref={`/w/${access.workspaceId}/transactions`}
      />
      <DeleteTransaction
        description={transaction.description}
        action={deleteTransactionAction.bind(
          null,
          access.workspaceId,
          transaction.id,
        )}
      />
    </TransactionPage>
  );
}

export default function EditTransactionPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditTransaction {...props} />
    </Suspense>
  );
}
