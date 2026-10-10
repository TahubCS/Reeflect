import "server-only";
import { redirect } from "next/navigation";
import { ensurePersonalWorkspace } from "./personal-workspace";
import { getSession } from "./session";

/**
 * `path` inside the signed-in user's Personal workspace, e.g. "/dashboard"
 * becomes "/w/<id>/dashboard" (ADR-007). Sends a signed-out visitor to sign
 * in. Reads the session, so call it inside a Suspense boundary.
 */
export async function personalWorkspaceHref(
  path: `/${string}`,
): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const workspaceId = await ensurePersonalWorkspace(session.user.id);
  return `/w/${workspaceId}${path}`;
}
