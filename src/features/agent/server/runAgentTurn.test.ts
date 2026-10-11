import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { approveLink, createLinkCode } from "@/features/messaging/server/link";
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
import { UNCLEAR_REPLIES } from "../domain/log-replies";
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

  it("remembers what it asked: the account can be answered in the next text", async () => {
    const me = await newUser();
    const handle = newPhone();
    await text(handle, `LINK ${await newCode(me.userId)}`);
    await approveLink(me.userId, me.workspaceId);
    const add = (
      type: "checking" | "credit_card",
      nickname: string,
      balance: number,
    ) =>
      createAccount(me.workspaceId, {
        type,
        institutionName: "Test Bank",
        nickname,
        maskLast4: null,
        balanceCents: cents(balance),
      });
    const mine = await add("checking", "Muhammad", 50_000);
    await add("credit_card", "Sample · Credit Card", -5_000);
    await add("checking", "Sample · 360 Checking", 10_000);
    const balance = async () =>
      (await getAccount(me.workspaceId, mine))!.balanceCents;
    const QUESTION =
      'Which account for $8.75 "cloudflare to buy a domain"? Reply with its number or name: 1 Muhammad, 2 Sample · Credit Card, 3 Sample · 360 Checking. Nothing is logged yet.';

    // The conversation a real phone had, which logged nothing at the time.
    expect(
      await text(handle, "I spent 8.75 on cloudflare to buy a domain."),
    ).toBe(QUESTION);
    // Two checking accounts, so this cannot say which: asked again.
    expect(await text(handle, "It was from my checking account")).toBe(
      QUESTION,
    );
    // A question in between is answered as usual and does not close it.
    expect(await text(handle, "how am I doing?")).toMatch(/^You have \$/);
    expect(await balance()).toBe(50_000);
    expect(await text(handle, "1")).toContain(
      'Logged $8.75 for "cloudflare to buy a domain" today on Muhammad',
    );
    expect(await balance()).toBe(49_125);

    // Naming the account in the first text needs no question.
    expect(
      await text(
        handle,
        "I spent 8.75 on cloudflare to buy domain from muhammad checking",
      ),
    ).toContain(
      'Logged $8.75 for "cloudflare to buy domain" today on Muhammad',
    );
    expect(await balance()).toBe(48_250);

    // New spending replaces an open question; UNDO closes it.
    await text(handle, "40 gas");
    expect(await text(handle, "12 lunch from Muhammad")).toContain(
      'Logged $12.00 for "lunch"',
    );
    expect(await text(handle, "1")).toBe(UNCLEAR_REPLIES.no_description);
    await text(handle, "40 gas");
    expect(await text(handle, "undo")).toBe('Removed $12.00 for "lunch".');
    expect(await text(handle, "1")).toBe(UNCLEAR_REPLIES.no_description);
    expect(await balance()).toBe(48_250);

    // After STOP the phone is a stranger again, question or not.
    await text(handle, "40 gas");
    expect(await text(handle, "STOP")).toBe(REPLIES.stopped);
    expect(await text(handle, "1")).toBe(REPLIES.signUp);
    expect(await balance()).toBe(48_250);
  });

  it("puts no digits in any fixed reply", () => {
    for (const reply of Object.values(REPLIES)) {
      expect(reply).not.toMatch(/\d/);
    }
  });
});
