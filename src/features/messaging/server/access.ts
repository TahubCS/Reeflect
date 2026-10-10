import "server-only";
import { and, eq } from "drizzle-orm";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { personalSlug } from "@/lib/auth/personal-workspace";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { organization } from "@/lib/db/schema";

/**
 * The signed-in user and `workspaceId`, when it is that user's own Personal
 * workspace: the only place a phone links to (ADR-034). Not found for a
 * visitor who is not its owner (ARCH-04); null for a workspace they own
 * that is not their Personal one.
 */
export async function ownPersonalWorkspace(
  workspaceId: unknown,
): Promise<{ userId: string; workspaceId: string } | null> {
  const session = await getSession();
  const access = await requireWorkspaceAccess(session, workspaceId, "owner");
  // `requireWorkspaceAccess` has already refused a missing session.
  const userId = session!.user.id;

  const [personal] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(
      and(
        eq(organization.id, access.workspaceId),
        eq(organization.slug, personalSlug(userId)),
      ),
    )
    .limit(1);
  return personal ? { userId, workspaceId: access.workspaceId } : null;
}
