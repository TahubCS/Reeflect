import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";

/**
 * A signed-out visitor goes to sign in (this may render before the parent's
 * check does); a signed-in non-member sees "not found".
 */
async function Member({
  params,
  children,
}: {
  params: Promise<{ workspaceId: string }>;
  children: ReactNode;
}) {
  const { workspaceId } = await params;
  const session = await getSession();
  if (!session) redirect("/sign-in");
  await requireWorkspaceAccess(session, workspaceId, "viewer");

  return children;
}

/**
 * Every page under /w/[workspaceId] belongs to one workspace (ADR-007).
 * The membership check reads the session and the URL, so it sits in its own
 * Suspense boundary: the parent layout's boundary does not cover a client
 * navigation that arrives from another signed-in page, and without one here
 * that navigation would wait on the server before showing anything.
 * Pages that load data still authorize in their own server code (ARCH-04).
 */
export default function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/w/[workspaceId]">): ReactNode {
  return (
    <Suspense fallback={<PageLoading />}>
      <Member params={params}>{children}</Member>
    </Suspense>
  );
}
