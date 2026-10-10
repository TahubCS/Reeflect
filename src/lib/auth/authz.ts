import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { member } from "@/lib/db/schema";
import type { WorkspaceRole } from "./permissions";
import { roleAtLeast, strongestRole } from "./roles";

/** A workspace id from a URL or form: ours are UUIDs, Better Auth's are short tokens. */
export const workspaceIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export type WorkspaceAccess = {
  workspaceId: string;
  role: WorkspaceRole;
};

/**
 * ARCH-04 step 3. Returns the verified workspace id and the member's role,
 * or calls `notFound()` when there is no session, the id is malformed, the
 * user is not a member, or their role is below `minimumRole`. Never
 * Forbidden, so a stranger cannot tell that a workspace exists.
 */
export async function requireWorkspaceAccess(
  session: { user: { id: string } } | null,
  workspaceId: unknown,
  minimumRole: WorkspaceRole,
): Promise<WorkspaceAccess> {
  const id = workspaceIdSchema.safeParse(workspaceId);
  if (!session || !id.success) notFound();

  const rows = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, id.data),
        eq(member.userId, session.user.id),
      ),
    );
  const role = rows
    .map((row) => strongestRole(row.role))
    .find((found) => found !== null && roleAtLeast(found, minimumRole));
  if (!role) notFound();

  return { workspaceId: id.data, role };
}
