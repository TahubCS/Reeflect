import "server-only";
import { and, asc, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  PROACTIVE_KINDS,
  messagingIdentity,
  notificationSetting,
  proactiveMessage,
} from "@/lib/db/schema";

// The proactive-message outbox (ADR-038, ADR-105). One row per subscription
// or bill cycle; the unique index makes every enqueue safe to repeat. No
// amounts and no text are stored.

export type ProactiveKind = (typeof PROACTIVE_KINDS)[number];

/** A linked phone whose owner opted in to proactive texts. */
export type AlertTarget = {
  identityId: string;
  userId: string;
  workspaceId: string;
  platform: "imessage" | "terminal";
  spaceId: string;
  subscriptionAlerts: boolean;
  billReminders: boolean;
};

/** No row in notification_setting means both types are on. */
const targetColumns = {
  identityId: messagingIdentity.id,
  userId: messagingIdentity.userId,
  workspaceId: messagingIdentity.workspaceId,
  platform: messagingIdentity.platform,
  spaceId: messagingIdentity.spaceId,
  subscriptionAlerts: sql<boolean>`coalesce(${notificationSetting.subscriptionAlerts}, true)`,
  billReminders: sql<boolean>`coalesce(${notificationSetting.billReminders}, true)`,
};

const optedIn = and(
  isNull(messagingIdentity.revokedAt),
  eq(messagingIdentity.proactiveOptIn, true),
);

/** Every phone that may be texted first, at most `limit` of them. */
export async function listAlertTargets(limit = 1000): Promise<AlertTarget[]> {
  return db
    .select(targetColumns)
    .from(messagingIdentity)
    .leftJoin(
      notificationSetting,
      eq(notificationSetting.userId, messagingIdentity.userId),
    )
    .where(optedIn)
    .orderBy(asc(messagingIdentity.id))
    .limit(limit);
}

/** The same phone, if it may still be texted first. */
async function currentTarget(
  executor: Pick<typeof db, "select">,
  identityId: string,
): Promise<AlertTarget | null> {
  const [row] = await executor
    .select(targetColumns)
    .from(messagingIdentity)
    .leftJoin(
      notificationSetting,
      eq(notificationSetting.userId, messagingIdentity.userId),
    )
    .where(and(eq(messagingIdentity.id, identityId), optedIn))
    .limit(1);
  return row ?? null;
}

export const wants = (target: AlertTarget, kind: ProactiveKind): boolean =>
  kind === "subscription_alert"
    ? target.subscriptionAlerts
    : target.billReminders;

/** Queues a text about `subjectKey`, once ever. True when it is new. */
export async function enqueue(
  target: AlertTarget,
  kind: ProactiveKind,
  subjectKey: string,
  now: Date,
): Promise<boolean> {
  if (!wants(target, kind)) return false;
  const rows = await db
    .insert(proactiveMessage)
    .values({
      userId: target.userId,
      identityId: target.identityId,
      workspaceId: target.workspaceId,
      kind,
      subjectKey,
      notBefore: now,
    })
    .onConflictDoNothing()
    .returning({ id: proactiveMessage.id });
  return rows.length > 0;
}

export type QueuedMessage = typeof proactiveMessage.$inferSelect;

/** What one delivery decided for its row. */
export type Outcome =
  | { status: "sent" }
  | { status: "cancelled" }
  | { status: "later"; notBefore: Date }
  | { status: "retry" };

/** Attempts before a text that will not go out is given up on. */
export const MAX_ATTEMPTS = 3;
/** How long to wait after a failed send. */
export const RETRY_MS = 5 * 60 * 1000;

export type Deliver = (
  message: QueuedMessage,
  target: AlertTarget | null,
  sentToday: (since: Date) => Promise<number>,
) => Promise<Outcome>;

/**
 * Takes one due row, locked so another tick cannot take it too, and lets
 * `deliver` decide what happens to it. The lock is held while the text is
 * sent, so it is sent at most once. False when nothing is due.
 */
export async function deliverOne(
  now: Date,
  deliver: Deliver,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [message] = await tx
      .select()
      .from(proactiveMessage)
      .where(
        and(
          eq(proactiveMessage.status, "queued"),
          lte(proactiveMessage.notBefore, now),
        ),
      )
      .orderBy(asc(proactiveMessage.notBefore), asc(proactiveMessage.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!message) return false;

    const target = await currentTarget(tx, message.identityId);
    const outcome = await deliver(message, target, async (since) => {
      const [row] = await tx
        .select({ sent: count() })
        .from(proactiveMessage)
        .where(
          and(
            eq(proactiveMessage.userId, message.userId),
            eq(proactiveMessage.status, "sent"),
            gte(proactiveMessage.sentAt, since),
          ),
        );
      return row?.sent ?? 0;
    });

    const where = eq(proactiveMessage.id, message.id);
    if (outcome.status === "sent") {
      await tx
        .update(proactiveMessage)
        .set({ status: "sent", sentAt: now, attempts: message.attempts + 1 })
        .where(where);
    } else if (outcome.status === "cancelled") {
      await tx
        .update(proactiveMessage)
        .set({ status: "cancelled" })
        .where(where);
    } else if (outcome.status === "later") {
      await tx
        .update(proactiveMessage)
        .set({ notBefore: outcome.notBefore })
        .where(where);
    } else {
      const attempts = message.attempts + 1;
      await tx
        .update(proactiveMessage)
        .set(
          attempts >= MAX_ATTEMPTS
            ? { status: "failed", attempts }
            : { attempts, notBefore: new Date(now.getTime() + RETRY_MS) },
        )
        .where(where);
    }
    return true;
  });
}

/** The last text sent to this phone since `since`, which a reply answers. */
export async function latestSent(
  identityId: string,
  since: Date,
): Promise<QueuedMessage | null> {
  const [row] = await db
    .select()
    .from(proactiveMessage)
    .where(
      and(
        eq(proactiveMessage.identityId, identityId),
        eq(proactiveMessage.status, "sent"),
        gte(proactiveMessage.sentAt, since),
      ),
    )
    .orderBy(desc(proactiveMessage.sentAt), desc(proactiveMessage.id))
    .limit(1);
  return row ?? null;
}
