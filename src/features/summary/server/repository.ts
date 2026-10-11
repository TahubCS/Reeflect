import "server-only";
import { and, count, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { summaryWrite } from "@/lib/db/schema";
import type { Panel } from "../domain/panel";

// The rows behind the summary panel (F-15, ADR-068): one for each time a
// member asked Gemini to write it. Every function takes the workspace id
// that `requireWorkspaceAccess` verified.

/** How many times this person has asked today, in any workspace. */
export async function countWrites(
  userId: string,
  today: string,
): Promise<number> {
  const [row] = await db
    .select({ asked: count() })
    .from(summaryWrite)
    .where(
      and(eq(summaryWrite.userId, userId), eq(summaryWrite.writtenOn, today)),
    );
  return row?.asked ?? 0;
}

/**
 * Takes one of this person's writes for today, or returns null when they
 * have none left. The count and the new row are under one lock for that
 * person, so two clicks at once cannot both take the last one. Rows from
 * earlier days are never shown or counted again, so theirs and this
 * workspace's are removed here.
 */
export async function reserveWrite(
  workspaceId: string,
  userId: string,
  today: string,
  limit: number,
): Promise<{ id: string; remaining: number } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`summary:${userId}`}, 0))`,
    );
    await tx
      .delete(summaryWrite)
      .where(
        and(
          lt(summaryWrite.writtenOn, today),
          or(
            eq(summaryWrite.userId, userId),
            eq(summaryWrite.workspaceId, workspaceId),
          ),
        ),
      );
    const [row] = await tx
      .select({ asked: count() })
      .from(summaryWrite)
      .where(
        and(eq(summaryWrite.userId, userId), eq(summaryWrite.writtenOn, today)),
      );
    const asked = row?.asked ?? 0;
    if (asked >= limit) return null;
    const [reserved] = await tx
      .insert(summaryWrite)
      .values({ workspaceId, userId, writtenOn: today })
      .returning({ id: summaryWrite.id });
    return { id: reserved!.id, remaining: limit - asked - 1 };
  });
}

/** Keeps what the model wrote, in label form, on the row taken for it. */
export async function saveDraft(
  workspaceId: string,
  writeId: string,
  draft: Panel,
): Promise<void> {
  await db
    .update(summaryWrite)
    .set({ draft })
    .where(
      and(
        eq(summaryWrite.id, writeId),
        eq(summaryWrite.workspaceId, workspaceId),
      ),
    );
}

/** The newest draft written for this workspace today, by any member. */
export async function latestDraft(
  workspaceId: string,
  today: string,
): Promise<{ draft: unknown; writtenAt: Date } | null> {
  const [row] = await db
    .select({ draft: summaryWrite.draft, writtenAt: summaryWrite.createdAt })
    .from(summaryWrite)
    .where(
      and(
        eq(summaryWrite.workspaceId, workspaceId),
        eq(summaryWrite.writtenOn, today),
        isNotNull(summaryWrite.draft),
      ),
    )
    .orderBy(desc(summaryWrite.createdAt), desc(summaryWrite.id))
    .limit(1);
  return row ?? null;
}
