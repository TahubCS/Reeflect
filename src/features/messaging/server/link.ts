import "server-only";
import { createHmac } from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  MESSAGING_PLATFORMS,
  agentLinkAttempt,
  agentLinkCode,
  messagingIdentity,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { maskHandle, normalizeHandle } from "../domain/handle";
import {
  LINK_CODE_TTL_MS,
  generateLinkCode,
  normalizeLinkCode,
} from "../domain/link-code";

// Phone linking (ADR-034, ADR-051). A phone texts a one-time code, the user
// approves that phone on the website, and only then does an identity exist.
// Every query here is scoped to one user or one handle.

export type Platform = (typeof MESSAGING_PLATFORMS)[number];

/** Wrong codes allowed from one handle inside the window before lockout. */
export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const CODE_INSERT_TRIES = 5;

/** Codes have little entropy, so the stored hash is keyed with a secret. */
function hashLinkCode(code: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`agent-link-code:${code}`)
    .digest("hex");
}

const activeIdentityOf = (userId: string) =>
  and(
    eq(messagingIdentity.userId, userId),
    isNull(messagingIdentity.revokedAt),
  );

const activeIdentityAt = (platform: Platform, handle: string) =>
  and(
    eq(messagingIdentity.platform, platform),
    eq(messagingIdentity.handle, handle),
    isNull(messagingIdentity.revokedAt),
  );

const liveCodeOf = (userId: string, now: Date) =>
  and(
    eq(agentLinkCode.userId, userId),
    isNull(agentLinkCode.usedAt),
    gt(agentLinkCode.expiresAt, now),
  );

export type LinkState =
  | { status: "none" }
  | { status: "code_active"; expiresAt: string }
  | { status: "pending"; handleLabel: string; expiresAt: string }
  | {
      status: "linked";
      handleLabel: string;
      linkedAt: string;
      proactiveOptIn: boolean;
    };

/** What the Settings card shows. Handles leave here masked. */
export async function getLinkState(
  userId: string,
  now: Date = new Date(),
): Promise<LinkState> {
  const [identity] = await db
    .select({
      handle: messagingIdentity.handle,
      verifiedAt: messagingIdentity.verifiedAt,
      proactiveOptIn: messagingIdentity.proactiveOptIn,
    })
    .from(messagingIdentity)
    .where(activeIdentityOf(userId))
    .limit(1);
  if (identity) {
    return {
      status: "linked",
      handleLabel: maskHandle(identity.handle),
      linkedAt: identity.verifiedAt.toISOString(),
      proactiveOptIn: identity.proactiveOptIn,
    };
  }

  const [code] = await db
    .select({
      handle: agentLinkCode.handle,
      expiresAt: agentLinkCode.expiresAt,
    })
    .from(agentLinkCode)
    .where(liveCodeOf(userId, now))
    .orderBy(desc(agentLinkCode.createdAt))
    .limit(1);
  if (!code) return { status: "none" };

  const expiresAt = code.expiresAt.toISOString();
  return code.handle === null
    ? { status: "code_active", expiresAt }
    : { status: "pending", handleLabel: maskHandle(code.handle), expiresAt };
}

export type NewLinkCode =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; reason: "already_linked" };

/**
 * A fresh code for the user, replacing any earlier one. The plain code is
 * returned once and never stored.
 */
export async function createLinkCode(
  userId: string,
  now: Date = new Date(),
): Promise<NewLinkCode> {
  const [linked] = await db
    .select({ id: messagingIdentity.id })
    .from(messagingIdentity)
    .where(activeIdentityOf(userId))
    .limit(1);
  if (linked) return { ok: false, reason: "already_linked" };

  // This user's earlier codes, and everyone's expired ones, which would
  // otherwise keep their hashes reserved.
  await db
    .delete(agentLinkCode)
    .where(
      or(eq(agentLinkCode.userId, userId), lt(agentLinkCode.expiresAt, now)),
    );

  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  for (let attempt = 0; attempt < CODE_INSERT_TRIES; attempt += 1) {
    const code = generateLinkCode();
    const inserted = await db
      .insert(agentLinkCode)
      .values({ userId, codeHash: hashLinkCode(code), expiresAt })
      .onConflictDoNothing({ target: agentLinkCode.codeHash })
      .returning({ id: agentLinkCode.id });
    if (inserted.length > 0) {
      return { ok: true, code, expiresAt: expiresAt.toISOString() };
    }
  }
  throw new Error("link code: no free code after several tries");
}

export type ClaimResult = "pending" | "failed" | "locked" | "already_linked";

/**
 * A phone texted a code. A match records the phone on the code as a request
 * for the user to approve; it grants nothing by itself. Every miss counts
 * toward the lockout, whatever the reason, so the reply cannot be used to
 * tell a wrong code from an expired or taken one.
 */
export async function claimLinkCode(
  input: { platform: Platform; handle: string; spaceId: string; code: string },
  now: Date = new Date(),
): Promise<ClaimResult> {
  const handle = normalizeHandle(input.handle);
  const { platform, spaceId } = input;

  const [linked] = await db
    .select({ id: messagingIdentity.id })
    .from(messagingIdentity)
    .where(activeIdentityAt(platform, handle))
    .limit(1);
  if (linked) return "already_linked";

  const windowStart = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  const [attempts] = await db
    .select({ failed: count() })
    .from(agentLinkAttempt)
    .where(
      and(
        eq(agentLinkAttempt.platform, platform),
        eq(agentLinkAttempt.handle, handle),
        gt(agentLinkAttempt.attemptedAt, windowStart),
      ),
    );
  if ((attempts?.failed ?? 0) >= MAX_FAILED_ATTEMPTS) return "locked";

  const code = normalizeLinkCode(input.code);
  if (code !== null) {
    // One statement, so two phones texting the same code cannot both win.
    const claimed = await db
      .update(agentLinkCode)
      .set({ platform, handle, spaceId, claimedAt: now })
      .where(
        and(
          eq(agentLinkCode.codeHash, hashLinkCode(code)),
          isNull(agentLinkCode.usedAt),
          gt(agentLinkCode.expiresAt, now),
          or(
            isNull(agentLinkCode.handle),
            and(
              eq(agentLinkCode.platform, platform),
              eq(agentLinkCode.handle, handle),
            ),
          ),
        ),
      )
      .returning({ id: agentLinkCode.id });
    if (claimed.length > 0) return "pending";
  }

  await db
    .insert(agentLinkAttempt)
    .values({ platform, handle, attemptedAt: now });
  return "failed";
}

/** The conversation a phone linked from: where to text it. */
export type LinkedPhone = { platform: Platform; spaceId: string };

/**
 * The user approved the phone waiting on their code: create the identity in
 * `workspaceId` (their Personal workspace, resolved by the caller) and spend
 * the code. Returns the phone's conversation, or null when there is no live
 * request, or when the phone or the user was linked elsewhere in the
 * meantime.
 */
export async function approveLink(
  userId: string,
  workspaceId: string,
  now: Date = new Date(),
): Promise<LinkedPhone | null> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select({
        id: agentLinkCode.id,
        platform: agentLinkCode.platform,
        handle: agentLinkCode.handle,
        spaceId: agentLinkCode.spaceId,
      })
      .from(agentLinkCode)
      .where(liveCodeOf(userId, now))
      .orderBy(desc(agentLinkCode.createdAt))
      .limit(1)
      .for("update");
    if (
      !request ||
      request.platform === null ||
      request.handle === null ||
      request.spaceId === null
    ) {
      return null;
    }

    await tx
      .update(agentLinkCode)
      .set({ usedAt: now })
      .where(eq(agentLinkCode.id, request.id));

    // Either unique index (one user per phone, one phone per user) may
    // refuse the row; that is a refusal, not an error.
    const created = await tx
      .insert(messagingIdentity)
      .values({
        userId,
        workspaceId,
        platform: request.platform,
        handle: request.handle,
        spaceId: request.spaceId,
        verifiedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: messagingIdentity.id });
    return created.length > 0
      ? { platform: request.platform, spaceId: request.spaceId }
      : null;
  });
}

/**
 * The user refused the request, or wants the code gone: spend it. Returns
 * the conversation of the phone that was waiting on it, so it can be told,
 * or null when no phone had texted the code or the code had expired.
 */
export async function rejectLink(
  userId: string,
  now: Date = new Date(),
): Promise<LinkedPhone | null> {
  const spent = await db
    .update(agentLinkCode)
    .set({ usedAt: now })
    .where(and(eq(agentLinkCode.userId, userId), isNull(agentLinkCode.usedAt)))
    .returning({
      platform: agentLinkCode.platform,
      spaceId: agentLinkCode.spaceId,
      expiresAt: agentLinkCode.expiresAt,
    });
  for (const { platform, spaceId, expiresAt } of spent) {
    if (platform !== null && spaceId !== null && expiresAt > now) {
      return { platform, spaceId };
    }
  }
  return null;
}

/** STOP from a phone. True when a link existed and is now revoked. */
export async function revokeByHandle(
  platform: Platform,
  rawHandle: string,
  now: Date = new Date(),
): Promise<boolean> {
  const revoked = await db
    .update(messagingIdentity)
    .set({ revokedAt: now })
    .where(activeIdentityAt(platform, normalizeHandle(rawHandle)))
    .returning({ id: messagingIdentity.id });
  return revoked.length > 0;
}

/**
 * Disconnect from the website. Returns the conversation of the phone that
 * was linked, so it can be told, or null when none was.
 */
export async function revokeForUser(
  userId: string,
  now: Date = new Date(),
): Promise<LinkedPhone | null> {
  const [revoked] = await db
    .update(messagingIdentity)
    .set({ revokedAt: now })
    .where(activeIdentityOf(userId))
    .returning({
      platform: messagingIdentity.platform,
      spaceId: messagingIdentity.spaceId,
    });
  return revoked ?? null;
}

/** Opt in to, or out of, texts the agent sends first (ADR-038). */
export async function setProactiveOptIn(
  userId: string,
  optIn: boolean,
): Promise<void> {
  await db
    .update(messagingIdentity)
    .set({ proactiveOptIn: optIn })
    .where(activeIdentityOf(userId));
}

export type VerifiedIdentity = {
  identityId: string;
  userId: string;
  workspaceId: string;
};

/**
 * Who a phone may act as (ADR-034), or null when it is not linked. The
 * agent takes its workspace id from here and nowhere else.
 */
export async function findIdentity(
  platform: Platform,
  rawHandle: string,
): Promise<VerifiedIdentity | null> {
  const [identity] = await db
    .select({
      identityId: messagingIdentity.id,
      userId: messagingIdentity.userId,
      workspaceId: messagingIdentity.workspaceId,
    })
    .from(messagingIdentity)
    .where(activeIdentityAt(platform, normalizeHandle(rawHandle)))
    .limit(1);
  return identity ?? null;
}
