import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { approveLink, createLinkCode } from "@/features/messaging/server/link";
import {
  ensurePersonalWorkspace,
  personalSlug,
} from "@/lib/auth/personal-workspace";
import { db } from "@/lib/db/client";
import { agentLinkAttempt, organization, user } from "@/lib/db/schema";
import { REPLIES } from "../domain/replies";
import { runAgentTurn } from "./runAgentTurn";

// Integration tests against the Docker database (TEST-05). The link code is
// made and approved through messaging's own functions, as the website does.

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

function newPhone(): string {
  const handle = `+1${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;
  handles.push(handle);
  return handle;
}

const text = (handle: string, message: string): Promise<string> =>
  runAgentTurn({
    platform: "imessage",
    handle,
    spaceId: `any;-;${handle}`,
    messageId: crypto.randomUUID(),
    text: message,
  });

async function newCode(userId: string): Promise<string> {
  const result = await createLinkCode(userId);
  if (!result.ok) throw new Error("expected a code");
  return result.code;
}

afterAll(async () => {
  await db
    .delete(agentLinkAttempt)
    .where(inArray(agentLinkAttempt.handle, handles));
  await db
    .delete(organization)
    .where(inArray(organization.slug, userIds.map(personalSlug)));
  await db.delete(user).where(inArray(user.id, userIds));
});

describe("runAgentTurn", () => {
  it("gives an unlinked phone only the sign-up reply, whatever it asks", async () => {
    const handle = newPhone();

    for (const message of ["how am I doing?", "balance", "12 lunch", ""]) {
      expect(await text(handle, message)).toBe(REPLIES.signUp);
    }
  });

  it("links a phone only after the website approves it", async () => {
    const me = await newUser();
    const handle = newPhone();
    const code = await newCode(me.userId);

    expect(await text(handle, `LINK ${code}`)).toBe(REPLIES.linkPending);
    // Texting the code is not enough.
    expect(await text(handle, "how am I doing?")).toBe(REPLIES.signUp);

    await approveLink(me.userId, me.workspaceId);

    // Linked: now it gets an answer about its own workspace (F-25). No
    // model key is set under test, so the reply is the one built by code.
    expect(await text(handle, "how am I doing?")).toContain(
      "no accounts for you yet",
    );
    expect(await text(handle, `LINK ${code}`)).toBe(REPLIES.alreadyLinked);
  });

  it("answers a wrong code the same way every time, then locks", async () => {
    const handle = newPhone();

    for (let i = 0; i < 5; i += 1) {
      expect(await text(handle, "LINK 000000")).toBe(REPLIES.linkFailed);
    }
    expect(await text(handle, "LINK 000000")).toBe(REPLIES.linkLocked);
  });

  it("unlinks on STOP and returns the phone to the sign-up reply", async () => {
    const me = await newUser();
    const handle = newPhone();
    await text(handle, `link ${await newCode(me.userId)}`);
    await approveLink(me.userId, me.workspaceId);

    expect(await text(handle, "Stop.")).toBe(REPLIES.stopped);
    expect(await text(handle, "how am I doing?")).toBe(REPLIES.signUp);
    expect(await text(handle, "STOP")).toBe(REPLIES.notLinked);
  });

  it("puts no digits in any fixed reply", () => {
    for (const reply of Object.values(REPLIES)) {
      expect(reply).not.toMatch(/\d/);
    }
  });
});
