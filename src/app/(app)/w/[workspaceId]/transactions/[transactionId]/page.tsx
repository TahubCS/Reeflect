import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

export default async function EditTransactionPage({
  params,
}: PageProps<"/w/[workspaceId]/transactions/[transactionId]">) {
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
        ledgerEditable={transaction.editableInFull}
        fixedSummary={`${formatSigned(transaction.amountCents)} on ${transaction.accountNickname}, ${formatDay(transaction.postedOn)}. This transaction was ${SOURCE_NAMES[transaction.source]}, so its account, date and amount stay as they came.`}
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
