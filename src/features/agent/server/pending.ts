import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentPendingLog } from "@/lib/db/schema";
import { type Cents, cents } from "@/lib/money";
import type { LogDay } from "../domain/log";

// The one question the agent remembers: spending that is waiting for its
// account (ADR-065), or what was read from a receipt photo and is waiting
// for a yes (ADR-067). Every query is scoped to one verified phone link and its
// workspace (ADR-034).

/** How long the agent waits for the answer. */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export type PendingLog = {
  amount: Cents;
  description: string;
  day: LogDay;
  /** The accounts that were listed, in the order they were numbered. */
  accountIds: string[];
  askedAt: Date;
  /**
   * `account`: which account a text's spending is for (ADR-065).
   * `receipt`: whether to log what was read from a photo (ADR-067).
   */
  kind: "account" | "receipt";
  /** A receipt's category, as its question showed it. */
  categoryId: string | null;
  /** A receipt's photo: the platform's id for that message. */
  messageId: string | null;
};

/** A question to remember; one about an account needs no more than before. */
export type NewPending = Omit<PendingLog, "kind" | "categoryId" | "messageId"> &
  Partial<Pick<PendingLog, "kind" | "categoryId" | "messageId">>;

type Owner = { identityId: string; workspaceId: string };

const ownedBy = ({ identityId, workspaceId }: Owner) =>
  and(
    eq(agentPendingLog.identityId, identityId),
    eq(agentPendingLog.workspaceId, workspaceId),
  );

const stillOpen = (owner: Owner, now: Date) =>
  and(
    ownedBy(owner),
    gt(agentPendingLog.askedAt, new Date(now.getTime() - PENDING_TTL_MS)),
  );

/** Remembers the question, replacing any earlier one from this phone. */
export async function rememberPending(
  owner: Owner,
  pending: NewPending,
): Promise<void> {
  const values = {
    workspaceId: owner.workspaceId,
    amountCents: pending.amount,
    description: pending.description,
    day: pending.day,
    accountIds: pending.accountIds,
    askedAt: pending.askedAt,
    // Written every time, so a new question never keeps the last one's.
    kind: pending.kind ?? ("account" as const),
    categoryId: pending.categoryId ?? null,
    messageId: pending.messageId ?? null,
  };
  await db
    .insert(agentPendingLog)
    .values({ identityId: owner.identityId, ...values })
    .onConflictDoUpdate({ target: agentPendingLog.identityId, set: values });
}

/** The question this phone has open, or null. */
export async function findPending(
  owner: Owner,
  now: Date,
): Promise<PendingLog | null> {
  const [row] = await db
    .select()
    .from(agentPendingLog)
    .where(stillOpen(owner, now))
    .limit(1);
  if (!row) return null;
  return {
    amount: cents(row.amountCents),
    description: row.description,
    day: row.day,
    accountIds: row.accountIds,
    askedAt: row.askedAt,
    kind: row.kind,
    categoryId: row.categoryId,
    messageId: row.messageId,
  };
}

/**
 * Closes the open question so it can be acted on. One statement: of two
 * answers arriving together, only one gets true.
 */
export async function takePending(owner: Owner, now: Date): Promise<boolean> {
  const taken = await db
    .delete(agentPendingLog)
    .where(stillOpen(owner, now))
    .returning({ identityId: agentPendingLog.identityId });
  return taken.length > 0;
}

/** Forgets the question: the person moved on to something else. */
export async function clearPending(owner: Owner): Promise<void> {
  await db.delete(agentPendingLog).where(ownedBy(owner));
}
