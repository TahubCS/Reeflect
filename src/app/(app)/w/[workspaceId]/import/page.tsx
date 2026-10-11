import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { PageLoading } from "@/components/ui/page-loading";
import { listAccounts } from "@/features/accounts";
import {
  ImportPage,
  PreviewPanel,
  UploadForm,
  WaitingList,
  commitImportAction,
  discardImportAction,
  listPreviews,
  loadPreview,
  previewImportAction,
} from "@/features/imports";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { roleAtLeast } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { statementStore } from "@/lib/storage";

export const metadata: Metadata = { title: "Import" };

type Props = PageProps<"/w/[workspaceId]/import">;

const batchIdSchema = z.uuid();

// Reads the URL, the session, the accounts and stored files, so the page
// renders this inside a Suspense boundary.
async function Import({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const canEdit = roleAtLeast(access.role, "editor");
  const store = statementStore();
  if (!store) {
    return (
      <ImportPage>
        <p>
          Statement import isn’t set up on this server yet: object storage is
          not configured.
        </p>
      </ImportPage>
    );
  }

  const accounts = await listAccounts(access.workspaceId);
  const label = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    return account
      ? `${account.nickname}${account.maskLast4 ? ` ••${account.maskLast4}` : ""}`
      : "An account";
  };

  const requested = batchIdSchema.safeParse((await searchParams).batch);
  if (requested.success) {
    const view = await loadPreview(access.workspaceId, requested.data, store);
    if (view) {
      return (
        <ImportPage>
          <p>
            Into <strong>{label(view.batch.accountId)}</strong>.{" "}
            <Link href={`/w/${access.workspaceId}/import`}>Upload another</Link>
          </p>
          <PreviewPanel
            summary={view.summary}
            checks={view.batch.checks}
            rows={view.rows}
            newRows={view.batch.rowsParsed - view.batch.rowsSkippedDuplicate}
            needsIdentityConfirmation={view.needsIdentityConfirmation}
            canEdit={canEdit}
            commit={commitImportAction.bind(
              null,
              access.workspaceId,
              view.batch.id,
            )}
            discard={discardImportAction.bind(
              null,
              access.workspaceId,
              view.batch.id,
            )}
          />
        </ImportPage>
      );
    }
  }

  const previews = await listPreviews(access.workspaceId);
  return (
    <ImportPage>
      {requested.success && (
        <p role="status">
          That preview is no longer waiting. It may have been imported or
          discarded.
        </p>
      )}
      {!canEdit ? (
        <p>
          You can view this workspace but not add to it, so importing is turned
          off.
        </p>
      ) : accounts.length === 0 ? (
        <p>
          Statements are imported into one of your accounts.{" "}
          <Link href={`/w/${access.workspaceId}/accounts/new`}>
            Add an account
          </Link>{" "}
          first.
        </p>
      ) : (
        <UploadForm
          action={previewImportAction.bind(null, access.workspaceId)}
          accounts={accounts.map((account) => ({
            id: account.id,
            label: label(account.id),
          }))}
        />
      )}
      <WaitingList
        workspaceId={access.workspaceId}
        previews={previews.map((preview) => ({
          id: preview.id,
          label: `${label(preview.accountId)} (${preview.productName}, ${preview.kind.toUpperCase()})`,
          periodStart: preview.periodStart,
          periodEnd: preview.periodEnd,
        }))}
      />
    </ImportPage>
  );
}

export default function ImportRoute(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Import {...props} />
    </Suspense>
  );
}
