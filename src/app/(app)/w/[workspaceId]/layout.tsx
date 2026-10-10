import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";

/**
 * Every page under /w/[workspaceId] belongs to one workspace (ADR-007). A
 * signed-out visitor goes to sign in (this may render before the parent's
 * check does); a signed-in non-member sees "not found". The parent layout already
 * renders this inside a Suspense boundary, as reading the session needs.
 * Pages that load data still authorize in their own server code (ARCH-04).
 */
export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/w/[workspaceId]">): Promise<ReactNode> {
  const { workspaceId } = await params;
  const session = await getSession();
  if (!session) redirect("/sign-in");
  await requireWorkspaceAccess(session, workspaceId, "viewer");

  return children;
}
