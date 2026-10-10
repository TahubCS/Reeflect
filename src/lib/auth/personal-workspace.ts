import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { member, organization } from "@/lib/db/schema";

// Every user has exactly one Personal workspace, with them as its only
// member and owner (ADR-007). It is made at sign-up; people who signed up
// before that existed get theirs the first time they open the app.

export const PERSONAL_WORKSPACE_NAME = "Personal";

/** One Personal workspace per user, so its slug is derived from the user id. */
export function personalSlug(userId: string): string {
  return `personal-${userId}`;
}

async function findPersonalWorkspace(userId: string): Promise<string | null> {
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, userId),
      ),
    )
    .where(eq(organization.slug, personalSlug(userId)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * The id of the user's Personal workspace, created if it does not exist yet.
 * Safe to call more than once at the same time: the unique slug lets only
 * one creation through.
 */
export async function ensurePersonalWorkspace(userId: string): Promise<string> {
  const existing = await findPersonalWorkspace(userId);
  if (existing) return existing;

  const now = new Date();
  const created = await db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(organization)
      .values({
        id: uuidv7(),
        name: PERSONAL_WORKSPACE_NAME,
        slug: personalSlug(userId),
        createdAt: now,
        metadata: JSON.stringify({ kind: "personal" }),
      })
      .onConflictDoNothing({ target: organization.slug })
      .returning({ id: organization.id });
    if (!workspace) return null;

    await tx.insert(member).values({
      id: uuidv7(),
      organizationId: workspace.id,
      userId,
      role: "owner",
      createdAt: now,
    });
    return workspace.id;
  });
  if (created) return created;

  // Another request created it between our lookup and our insert.
  const raced = await findPersonalWorkspace(userId);
  if (!raced) {
    throw new Error(`personal workspace slug taken for user ${userId}`);
  }
  return raced;
}
