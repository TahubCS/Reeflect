import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import {
  AccountForm,
  AccountPage,
  createAccountAction,
} from "@/features/accounts";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Add an account" };

type Props = PageProps<"/w/[workspaceId]/accounts/new">;

// Reads the URL and the session, so the page renders this inside a Suspense
// boundary.
async function NewAccount({ params }: Pick<Props, "params">) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "editor",
  );

  return (
    <AccountPage
      title="Add an account"
      lede="A checking, savings, card or loan account. You can change any of this later."
    >
      <AccountForm
        action={createAccountAction.bind(null, access.workspaceId)}
        initial={{
          type: "checking",
          institutionName: "",
          nickname: "",
          maskLast4: "",
          balance: "",
        }}
        balanceEditable
        submitLabel="Add account"
        busyLabel="Adding…"
        cancelHref={`/w/${access.workspaceId}/accounts`}
      />
    </AccountPage>
  );
}

export default function NewAccountPage({ params }: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewAccount params={params} />
    </Suspense>
  );
}
