import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Edit account" };

export default async function EditAccountPage({
  params,
}: PageProps<"/w/[workspaceId]/accounts/[accountId]">) {
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
