import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AccountForm,
  AccountPage,
  DeleteAccount,
  accountIdSchema,
  deleteAccountAction,
  displayedBalance,
  getAccount,
  updateAccountAction,
} from "@/features/accounts";
import { PageLoading } from "@/components/ui/page-loading";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Edit account" };

type Props = PageProps<"/w/[workspaceId]/accounts/[accountId]">;

// Reads the URL, the session and the account, so the page renders this
// inside a Suspense boundary.
async function EditAccount({ params }: Pick<Props, "params">) {
  const { workspaceId, accountId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "editor",
  );
  const id = accountIdSchema.safeParse(accountId);
  if (!id.success) notFound();
  const account = await getAccount(access.workspaceId, id.data);
  if (!account) notFound();

  return (
    <AccountPage title={`Edit ${account.nickname}`}>
      <AccountForm
        action={updateAccountAction.bind(null, access.workspaceId, account.id)}
        initial={{
          type: account.type,
          institutionName: account.institutionName,
          nickname: account.nickname,
          maskLast4: account.maskLast4 ?? "",
          balance: displayedBalance(account.type, account.balanceCents),
        }}
        balanceEditable={account.balanceEditable}
        submitLabel="Save changes"
        busyLabel="Saving…"
        cancelHref={`/w/${access.workspaceId}/accounts`}
      />
      <DeleteAccount
        nickname={account.nickname}
        action={deleteAccountAction.bind(null, access.workspaceId, account.id)}
      />
    </AccountPage>
  );
}

export default function EditAccountPage({ params }: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditAccount params={params} />
    </Suspense>
  );
}
