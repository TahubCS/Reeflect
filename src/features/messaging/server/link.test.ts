import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  ensurePersonalWorkspace,
  personalSlug,
} from "@/lib/auth/personal-workspace";
import { db } from "@/lib/db/client";
import {
  agentLinkAttempt,
  agentLinkCode,
  messagingIdentity,
  organization,
  user,
} from "@/lib/db/schema";
import { LINK_CODE_TTL_MS } from "../domain/link-code";
import {
  ATTEMPT_WINDOW_MS,
  MAX_FAILED_ATTEMPTS,
  approveLink,
  claimLinkCode,
  createLinkCode,
  findIdentity,
  getLinkState,
  rejectLink,
  revokeByHandle,
  revokeForUser,
  setProactiveOptIn,
} from "./link";

// Integration tests: they need the PostgreSQL from `docker compose up -d`
// (or the CI service), migrated. See TEST-05.

const userIds: string[] = [];
const handles: string[] = [];

async function newUser(): Promise<{ userId: string; workspaceId: string }> {
  const userId = crypto.randomUUID();
  await db
    .insert(user)
    .values({ id: userId, name: "Test", email: `${userId}@example.test` });
  userIds.push(userId);
  return { userId, workspaceId: await ensurePersonalWorkspace(userId) };
}

/** A phone number no other test uses, in the format the platform reports. */
function newPhone(): string {
  const digits = String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
  const handle = `+1${digits}`;
  handles.push(handle);
  return handle;
}

const from = (handle: string, code: string) => ({
  platform: "imessage" as const,
  handle,
  spaceId: `any;-;${handle}`,
  code,
});

async function newCode(userId: string, now?: Date): Promise<string> {
  const result = await createLinkCode(userId, now);
  if (!result.ok) throw new Error("expected a code");
  return result.code;
}

/** A user with a phone linked through the whole flow. */
async function linkedUser() {
  const person = await newUser();
  const handle = newPhone();
  await claimLinkCode(from(handle, await newCode(person.userId)));
  await approveLink(person.userId, person.workspaceId);
  return { ...person, handle };
}

afterAll(async () => {
  await db
    .delete(agentLinkAttempt)
    .where(inArray(agentLinkAttempt.handle, handles));
  // Deleting the users removes their codes, identities and memberships.
  await db
    .delete(organization)
    .where(inArray(organization.slug, userIds.map(personalSlug)));
  await db.delete(user).where(inArray(user.id, userIds));
});

describe("createLinkCode", () => {
  it("returns a six-digit code valid for ten minutes and stores only a hash", async () => {
    const { userId } = await newUser();
    const now = new Date();

    const result = await createLinkCode(userId, now);

    if (!result.ok) throw new Error("expected a code");
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.expiresAt).toBe(
      new Date(now.getTime() + LINK_CODE_TTL_MS).toISOString(),
    );
    const rows = await db
      .select()
      .from(agentLinkCode)
      .where(eq(agentLinkCode.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows[0])).not.toContain(result.code);
  });

  it("replaces the user's earlier code", async () => {
    const { userId } = await newUser();
    const first = await newCode(userId);
    const second = await newCode(userId);

    expect(await claimLinkCode(from(newPhone(), first))).toBe(
      first === second ? "pending" : "failed",
    );
    expect(await claimLinkCode(from(newPhone(), second))).toBe(
      first === second ? "failed" : "pending",
    );
  });

  it("refuses a user who already has a linked phone", async () => {
    const { userId } = await linkedUser();

    expect(await createLinkCode(userId)).toEqual({
      ok: false,
      reason: "already_linked",
    });
  });
});

describe("claimLinkCode", () => {
  it("records the phone as a request and links nothing yet", async () => {
    const { userId } = await newUser();
    const handle = newPhone();
    const code = await newCode(userId);

    expect(await claimLinkCode(from(handle, code))).toBe("pending");

    expect(await findIdentity("imessage", handle)).toBeNull();
    expect(await getLinkState(userId)).toMatchObject({
      status: "pending",
      handleLabel: `phone ending ${handle.slice(-4)}`,
    });
  });

  it("accepts the code typed with a space, and the handle with formatting", async () => {
    const { userId } = await newUser();
    const handle = newPhone();
    const code = await newCode(userId);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    const formatted = `+1 (${handle.slice(2, 5)}) ${handle.slice(5, 8)}-${handle.slice(8)}`;

    expect(await claimLinkCode(from(formatted, spaced))).toBe("pending");
    // The same phone texting again is the same request.
    expect(await claimLinkCode(from(handle, code))).toBe("pending");
  });

  it("fails a wrong code, a malformed code and an expired code alike", async () => {
    const { userId } = await newUser();
    const longAgo = new Date(Date.now() - LINK_CODE_TTL_MS - 1000);
    const expired = await newCode(userId, longAgo);

    expect(await claimLinkCode(from(newPhone(), expired))).toBe("failed");
    expect(await claimLinkCode(from(newPhone(), "12"))).toBe("failed");
    expect(await claimLinkCode(from(newPhone(), ""))).toBe("failed");
    expect(await getLinkState(userId)).toEqual({ status: "none" });
  });

  it("fails a code that another phone has already claimed", async () => {
    const { userId } = await newUser();
    const first = newPhone();
    const code = await newCode(userId);
    await claimLinkCode(from(first, code));

    expect(await claimLinkCode(from(newPhone(), code))).toBe("failed");

    expect(await getLinkState(userId)).toMatchObject({
      handleLabel: `phone ending ${first.slice(-4)}`,
    });
  });

  it("fails a code that was already used or refused", async () => {
    const used = await newUser();
    const usedCode = await newCode(used.userId);
    const phone = newPhone();
    await claimLinkCode(from(phone, usedCode));
    await approveLink(used.userId, used.workspaceId);
    await revokeForUser(used.userId);

    const refused = await newUser();
    const refusedCode = await newCode(refused.userId);
    await rejectLink(refused.userId);

    expect(await claimLinkCode(from(newPhone(), usedCode))).toBe("failed");
    expect(await claimLinkCode(from(newPhone(), refusedCode))).toBe("failed");
  });

  it("locks a phone out after five wrong codes, even for a right one", async () => {
    const { userId } = await newUser();
    const handle = newPhone();
    // The failures happen in the past, so the test can also see the lock end
    // without touching codes that other tests hold right now.
    const then = new Date(Date.now() - ATTEMPT_WINDOW_MS - 1000);

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      expect(await claimLinkCode(from(handle, "000000x"), then)).toBe("failed");
    }
    const code = await newCode(userId, then);
    expect(await claimLinkCode(from(handle, code), then)).toBe("locked");
    expect(await getLinkState(userId, then)).toMatchObject({
      status: "code_active",
    });

    // Once the window has passed, the same phone can link.
    const fresh = await newCode(userId);
    expect(await claimLinkCode(from(handle, fresh))).toBe("pending");
  });

  it("tells a phone that is already linked, without spending an attempt", async () => {
    const { handle } = await linkedUser();
    const other = await newUser();
    const code = await newCode(other.userId);

    for (let i = 0; i <= MAX_FAILED_ATTEMPTS; i += 1) {
      expect(await claimLinkCode(from(handle, code))).toBe("already_linked");
    }
    expect(await getLinkState(other.userId)).toMatchObject({
      status: "code_active",
    });
  });
});

describe("approveLink", () => {
  it("creates the identity in the given workspace and spends the code", async () => {
    const { userId, workspaceId } = await newUser();
    const handle = newPhone();
    const code = await newCode(userId);
    await claimLinkCode(from(handle, code));

    // The phone's own conversation comes back, so it can be told.
    expect(await approveLink(userId, workspaceId)).toEqual({
      platform: "imessage",
      spaceId: `any;-;${handle}`,
    });

    expect(await findIdentity("imessage", handle)).toMatchObject({
      userId,
      workspaceId,
    });
    expect(await getLinkState(userId)).toMatchObject({
      status: "linked",
      handleLabel: `phone ending ${handle.slice(-4)}`,
      proactiveOptIn: false,
    });
    expect(await approveLink(userId, workspaceId)).toBeNull();
    expect(await claimLinkCode(from(newPhone(), code))).toBe("failed");
  });

  it("does nothing without a request, or once the code has expired", async () => {
    const { userId, workspaceId } = await newUser();
    expect(await approveLink(userId, workspaceId)).toBeNull();

    // A code nobody has texted is not a request.
    const now = new Date();
    const code = await newCode(userId, now);
    expect(await approveLink(userId, workspaceId, now)).toBeNull();

    const handle = newPhone();
    await claimLinkCode(from(handle, code), now);
    const tooLate = new Date(now.getTime() + LINK_CODE_TTL_MS + 1000);
    expect(await approveLink(userId, workspaceId, tooLate)).toBeNull();
    expect(await findIdentity("imessage", handle)).toBeNull();
  });

  it("never links one phone to two users", async () => {
    const first = await newUser();
    const second = await newUser();
    const handle = newPhone();
    // Both request the same phone before either is approved.
    await claimLinkCode(from(handle, await newCode(first.userId)));
    await claimLinkCode(from(handle, await newCode(second.userId)));

    expect(await approveLink(first.userId, first.workspaceId)).not.toBeNull();
    expect(await approveLink(second.userId, second.workspaceId)).toBeNull();

    expect(await findIdentity("imessage", handle)).toMatchObject({
      userId: first.userId,
    });
    expect(await getLinkState(second.userId)).toEqual({ status: "none" });
  });
});

describe("rejectLink", () => {
  it("kills the request so it can no longer be approved", async () => {
    const { userId, workspaceId } = await newUser();
    const handle = newPhone();
    await claimLinkCode(from(handle, await newCode(userId)));

    // The waiting phone's conversation comes back, so it can be told.
    expect(await rejectLink(userId)).toEqual({
      platform: "imessage",
      spaceId: `any;-;${handle}`,
    });

    expect(await getLinkState(userId)).toEqual({ status: "none" });
    expect(await approveLink(userId, workspaceId)).toBeNull();
    expect(await findIdentity("imessage", handle)).toBeNull();
    expect(await rejectLink(userId)).toBeNull();
  });

  it("has no phone to tell when none texted the code, or it had expired", async () => {
    const unclaimed = await newUser();
    await newCode(unclaimed.userId);
    expect(await rejectLink(unclaimed.userId)).toBeNull();

    const late = await newUser();
    const now = new Date();
    await claimLinkCode(from(newPhone(), await newCode(late.userId, now)), now);
    const afterExpiry = new Date(now.getTime() + 60 * 60 * 1000);
    expect(await rejectLink(late.userId, afterExpiry)).toBeNull();

    expect(await rejectLink((await newUser()).userId)).toBeNull();
  });
});

describe("revoking", () => {
  it("STOP from the phone unlinks it and frees it to link again", async () => {
    const { userId, workspaceId, handle } = await linkedUser();

    expect(await revokeByHandle("imessage", handle)).toBe(true);

    expect(await findIdentity("imessage", handle)).toBeNull();
    expect(await getLinkState(userId)).toEqual({ status: "none" });
    expect(await revokeByHandle("imessage", handle)).toBe(false);

    await claimLinkCode(from(handle, await newCode(userId)));
    expect(await approveLink(userId, workspaceId)).not.toBeNull();
    const rows = await db
      .select({ revokedAt: messagingIdentity.revokedAt })
      .from(messagingIdentity)
      .where(eq(messagingIdentity.userId, userId));
    expect(rows.filter((row) => row.revokedAt === null)).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });

  it("disconnecting on the website unlinks only that user", async () => {
    const mine = await linkedUser();
    const theirs = await linkedUser();

    // The phone's own conversation comes back, so it can be told.
    expect(await revokeForUser(mine.userId)).toEqual({
      platform: "imessage",
      spaceId: `any;-;${mine.handle}`,
    });

    expect(await findIdentity("imessage", mine.handle)).toBeNull();
    expect(await findIdentity("imessage", theirs.handle)).not.toBeNull();
    expect(await revokeForUser(mine.userId)).toBeNull();
  });
});

describe("setProactiveOptIn", () => {
  it("changes only the caller's linked phone", async () => {
    const mine = await linkedUser();
    const theirs = await linkedUser();

    await setProactiveOptIn(mine.userId, true);

    expect(await getLinkState(mine.userId)).toMatchObject({
      proactiveOptIn: true,
    });
    expect(await getLinkState(theirs.userId)).toMatchObject({
      proactiveOptIn: false,
    });
  });
});

describe("findIdentity", () => {
  it("knows nothing about a phone that never linked", async () => {
    expect(await findIdentity("imessage", newPhone())).toBeNull();
  });
});
