import type { Metadata } from "next";
import {
  AccountForm,
  AccountPage,
  createAccountAction,
} from "@/features/accounts";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Add an account" };

export default async function NewAccountPage({
  params,
}: PageProps<"/w/[workspaceId]/accounts/new">) {
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
