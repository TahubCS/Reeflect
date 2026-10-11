import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { APP_NAME } from "@/config/app";
import { DEFAULT_QUIET_HOURS } from "@/features/messaging/domain/quiet-hours";
import { approveLink, createLinkCode } from "@/features/messaging/server/link";
import { getQuietHours } from "@/features/messaging/server/notifications";
import {
  ensurePersonalWorkspace,
  personalSlug,
} from "@/lib/auth/personal-workspace";
import { db } from "@/lib/db/client";
import { agentLinkAttempt, organization, user } from "@/lib/db/schema";
import {
  createAccount,
  getAccount,
} from "@/features/accounts/server/repository";
import { cents } from "@/lib/money";
import { LOG_REPLIES, UNCLEAR_REPLIES } from "../domain/log-replies";
import { QUIET_HOURS_REPLIES } from "../domain/quiet-hours-replies";
import { REPLIES } from "../domain/replies";
import { runAgentTurn } from "./runAgentTurn";

// Integration tests against the Docker database (TEST-05). The link code is
// made and approved through messaging's own functions, as the website does.

const userIds: string[] = [];
const handles: string[] = [];
const NIGHT = { startMinute: 23 * 60, endMinute: 7 * 60 };

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

  it("logs spending and undoes it for a linked phone, and for no one else", async () => {
    const me = await newUser();
    const handle = newPhone();
    await text(handle, `LINK ${await newCode(me.userId)}`);
    await approveLink(me.userId, me.workspaceId);
    const accountId = await createAccount(me.workspaceId, {
      type: "checking",
      institutionName: "Test Bank",
      nickname: "Everyday",
      maskLast4: null,
      balanceCents: cents(50_000),
    });
    const balance = async () =>
      (await getAccount(me.workspaceId, accountId))!.balanceCents;

    // A stranger's phone sending the same words writes nothing.
    expect(await text(newPhone(), "12 lunch")).toBe(REPLIES.signUp);
    expect(await balance()).toBe(50_000);

    expect(await text(handle, "12 lunch")).toContain(
      'Logged $12.00 for "lunch" today',
    );
    expect(await balance()).toBe(48_800);

    // An unclear text is answered by code and saves nothing.
    expect(await text(handle, "12 lunch and 5 coffee")).toBe(
      UNCLEAR_REPLIES.several_amounts,
    );
    expect(await balance()).toBe(48_800);

    // A question with a number still goes to the answer, not to a log.
    expect(
      await text(handle, "how much did I spend in the last 30 days?"),
    ).toMatch(/^You have \$488\.00 in checking and savings/);
    expect(await balance()).toBe(48_800);

    expect(await text(handle, "UNDO")).toBe('Removed $12.00 for "lunch".');
    expect(await balance()).toBe(50_000);

    // LINK and STOP are still read first.
    expect(await text(handle, "STOP")).toBe(REPLIES.stopped);
    expect(await text(handle, "12 lunch")).toBe(REPLIES.signUp);
    expect(await balance()).toBe(50_000);
  });

  it("sets quiet hours by text for a linked phone, and for no one else", async () => {
    const me = await newUser();
    const handle = newPhone();
    await text(handle, `LINK ${await newCode(me.userId)}`);
    await approveLink(me.userId, me.workspaceId);

    expect(await text(newPhone(), "quiet hours 11pm to 7am")).toBe(
      REPLIES.signUp,
    );
    expect(await getQuietHours(me.userId)).toEqual(DEFAULT_QUIET_HOURS);

    expect(
      await text(handle, `${APP_NAME}, register new quiet hours 11PM to 7 AM`),
    ).toBe("Quiet hours set: 11:00 PM to 7:00 AM. Reply UNDO to go back.");
    expect(await getQuietHours(me.userId)).toEqual(NIGHT);

    // Unclear times change nothing and are not read as spending.
    expect(await text(handle, "quiet hours 11 to 7")).toBe(
      QUIET_HOURS_REPLIES.unclear,
    );
    expect(await text(handle, "quiet hours?")).toContain(
      "Your quiet hours are 11:00 PM to 7:00 AM",
    );

    expect(await text(handle, "UNDO")).toBe(
      "Done. Quiet hours are back to 9:00 PM to 9:00 AM.",
    );
    expect(await getQuietHours(me.userId)).toEqual(DEFAULT_QUIET_HOURS);
    expect(await text(handle, "UNDO")).toBe(LOG_REPLIES.nothingToUndo);
  });

  it("undoes whichever came last: a log or a quiet-hours change", async () => {
    const me = await newUser();
    const handle = newPhone();
    await text(handle, `LINK ${await newCode(me.userId)}`);
    await approveLink(me.userId, me.workspaceId);
    const accountId = await createAccount(me.workspaceId, {
      type: "checking",
      institutionName: "Test Bank",
      nickname: "Everyday",
      maskLast4: null,
      balanceCents: cents(50_000),
    });
    const balance = async () =>
      (await getAccount(me.workspaceId, accountId))!.balanceCents;

    // Quiet hours, then a log: UNDO takes the log, then the quiet hours.
    await text(handle, "quiet hours 11pm to 7am");
    await text(handle, "12 lunch");
    expect(await text(handle, "UNDO")).toBe('Removed $12.00 for "lunch".');
    expect(await balance()).toBe(50_000);
    expect(await getQuietHours(me.userId)).toEqual(NIGHT);
    expect(await text(handle, "UNDO")).toBe(
      "Done. Quiet hours are back to 9:00 PM to 9:00 AM.",
    );

    // A log, then quiet hours: UNDO takes the quiet hours, then the log.
    await text(handle, "5 coffee");
    await text(handle, "quiet hours 11pm to 7am");
    expect(await text(handle, "UNDO")).toBe(
      "Done. Quiet hours are back to 9:00 PM to 9:00 AM.",
    );
    expect(await balance()).toBe(49_500);
    expect(await text(handle, "UNDO")).toBe('Removed $5.00 for "coffee".');
    expect(await balance()).toBe(50_000);
  });

  it("puts no digits in any fixed reply", () => {
    for (const reply of Object.values(REPLIES)) {
      expect(reply).not.toMatch(/\d/);
    }
  });
});
