import type { Metadata } from "next";
import { AccountList, listAccounts } from "@/features/accounts";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { roleAtLeast } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({
  params,
}: PageProps<"/w/[workspaceId]/accounts">) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const accounts = await listAccounts(access.workspaceId);

  return (
    <AccountList
      workspaceId={access.workspaceId}
      accounts={accounts}
      canEdit={roleAtLeast(access.role, "editor")}
    />
  );
}
