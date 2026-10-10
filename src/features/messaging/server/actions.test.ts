import { inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensurePersonalWorkspace,
  personalSlug,
} from "@/lib/auth/personal-workspace";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { member, organization, user } from "@/lib/db/schema";
import {
  approveLinkAction,
  createLinkCodeAction,
  disconnectAction,
  rejectLinkAction,
  setProactiveOptInAction,
} from "./actions";
import { claimLinkCode, findIdentity, getLinkState } from "./link";

// Integration tests against the Docker database (TEST-05). The session and
// Next's router refresh are the only parts replaced. Calls from a
// signed-out visitor or into another user's workspace are covered for every
// action by the isolation matrix (src/lib/auth/isolation.test.ts).

const signedIn = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: () => Promise.resolve(signedIn.session),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const userIds: string[] = [];
const workspaceIds: string[] = [];

async function newUser(): Promise<{ userId: string; workspaceId: string }> {
  const userId = crypto.randomUUID();
  await db
    .insert(user)
    .values({ id: userId, name: "Test", email: `${userId}@example.test` });
  userIds.push(userId);
  return { userId, workspaceId: await ensurePersonalWorkspace(userId) };
}

const newPhone = (): string =>
  `+1${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;

/** `notFound()` throws an error whose digest marks it as a 404. */
async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    digest: expect.stringContaining("404"),
  });
}

beforeEach(() => {
  signedIn.session = null;
});

afterAll(async () => {
  await db.delete(organization).where(inArray(organization.id, workspaceIds));
  await db
    .delete(organization)
    .where(inArray(organization.slug, userIds.map(personalSlug)));
  await db.delete(user).where(inArray(user.id, userIds));
});

describe("phone link actions", () => {
  it("link, approve, opt in and disconnect the signed-in user's phone", async () => {
    const me = await newUser();
    const handle = newPhone();
    signedIn.session = { user: { id: me.userId } };

    const created = await createLinkCodeAction(me.workspaceId);
    if (!created.ok) throw new Error("expected a code");
    await claimLinkCode({
      platform: "imessage",
      handle,
      spaceId: "space",
      code: created.code,
    });

    expect(await approveLinkAction(me.workspaceId)).toBe(true);
    expect(await findIdentity("imessage", handle)).toMatchObject({
      userId: me.userId,
      workspaceId: me.workspaceId,
    });

    await setProactiveOptInAction(me.workspaceId, true);
    expect(await getLinkState(me.userId)).toMatchObject({
      proactiveOptIn: true,
    });

    await disconnectAction(me.workspaceId);
    expect(await findIdentity("imessage", handle)).toBeNull();
  });

  it("refuses a request with Not me", async () => {
    const me = await newUser();
    const handle = newPhone();
    signedIn.session = { user: { id: me.userId } };
    const created = await createLinkCodeAction(me.workspaceId);
    if (!created.ok) throw new Error("expected a code");
    await claimLinkCode({
      platform: "imessage",
      handle,
      spaceId: "space",
      code: created.code,
    });

    await rejectLinkAction(me.workspaceId);

    expect(await approveLinkAction(me.workspaceId)).toBe(false);
    expect(await findIdentity("imessage", handle)).toBeNull();
  });

  it("rejects a value that is not a boolean", async () => {
    const me = await newUser();
    signedIn.session = { user: { id: me.userId } };

    await expect(
      setProactiveOptInAction(me.workspaceId, "yes" as unknown as boolean),
    ).rejects.toThrow();
  });

  const everyAction = (workspaceId: string): (() => Promise<unknown>)[] => [
    () => createLinkCodeAction(workspaceId),
    () => approveLinkAction(workspaceId),
    () => rejectLinkAction(workspaceId),
    () => disconnectAction(workspaceId),
    () => setProactiveOptInAction(workspaceId, true),
  ];

  it("is not found for a workspace the user owns that is not their Personal one", async () => {
    const me = await newUser();
    const household = uuidv7();
    workspaceIds.push(household);
    const now = new Date();
    await db.insert(organization).values({
      id: household,
      name: "Household",
      slug: `household-${household}`,
      createdAt: now,
    });
    await db.insert(member).values({
      id: uuidv7(),
      organizationId: household,
      userId: me.userId,
      role: "owner",
      createdAt: now,
    });
    signedIn.session = { user: { id: me.userId } };

    for (const action of everyAction(household)) {
      await expectNotFound(action());
    }
  });

  it("is not found for a malformed workspace id", async () => {
    const me = await newUser();
    signedIn.session = { user: { id: me.userId } };

    await expectNotFound(createLinkCodeAction("../etc"));
  });
});
