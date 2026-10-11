import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { AccountList, listAccounts } from "@/features/accounts";
import {
  NessieSyncPanel,
  lastNessieSync,
  syncNessieAction,
} from "@/features/nessie";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { roleAtLeast } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Accounts" };

type Props = PageProps<"/w/[workspaceId]/accounts">;

// Reads the URL, the session and the accounts, so the page renders this
// inside a Suspense boundary.
async function Accounts({ params }: Pick<Props, "params">) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const [accounts, nessie] = await Promise.all([
    listAccounts(access.workspaceId),
    lastNessieSync(access.workspaceId),
  ]);
  const canEdit = roleAtLeast(access.role, "editor");

  return (
    <AccountList
      workspaceId={access.workspaceId}
      accounts={accounts}
      canEdit={canEdit}
      sourcePanel={
        nessie.linked ? (
          <NessieSyncPanel
            action={syncNessieAction.bind(null, access.workspaceId)}
            lastSyncedAt={nessie.lastSyncedAt}
            canSync={canEdit}
          />
        ) : null
      }
    />
  );
}

export default function AccountsPage({ params }: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Accounts params={params} />
    </Suspense>
  );
}
