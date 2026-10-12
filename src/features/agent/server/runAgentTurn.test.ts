import { and, eq, inArray } from "drizzle-orm";
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
import {
  agentLinkAttempt,
  organization,
  transaction,
  user,
} from "@/lib/db/schema";
import {
  createAccount,
  getAccount,
} from "@/features/accounts/server/repository";
import { cents } from "@/lib/money";
import { CHAT_REPLIES } from "../domain/chat";
import { LOG_REPLIES, UNCLEAR_REPLIES } from "../domain/log-replies";
import { QUIET_HOURS_REPLIES } from "../domain/quiet-hours-replies";
import { REPLIES } from "../domain/replies";
import { TURNS_PER_MINUTE, runAgentTurn } from "./runAgentTurn";

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

const text = (
  handle: string,
  message: string,
  extra: Partial<Parameters<typeof runAgentTurn>[0]> = {},
): Promise<string> =>
  runAgentTurn({
    platform: "imessage",
    handle,
    spaceId: `any;-;${handle}`,
    messageId: crypto.randomUUID(),
    text: message,
    kind: "text",
    ...extra,
  });

/** A new user with a phone linked and approved, as the website does it. */
async function linkedPhone() {
  const me = await newUser();
  const handle = newPhone();
  await text(handle, `LINK ${await newCode(me.userId)}`);
  await approveLink(me.userId, me.workspaceId);
  return { ...me, handle };
}

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
    ).toBe(
      "Quiet hours set: 11:00 PM to 7:00 AM, Eastern time. Reply UNDO to go back.",
    );
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

  it("answers help, hello and thanks with fixed replies (HO-115)", async () => {
    const { handle } = await linkedPhone();

    for (const message of ["help", "HELP", "what can you do?", "?", ""]) {
      expect(await text(handle, message)).toBe(CHAT_REPLIES.help);
    }
    expect(await text(handle, "hi")).toBe(CHAT_REPLIES.greeting);
    expect(await text(handle, `hey ${APP_NAME}!`)).toBe(CHAT_REPLIES.greeting);
    expect(await text(handle, "thanks!")).toBe(CHAT_REPLIES.thanks);
    // Not about money, and no model under test: a polite decline, not a
    // summary nobody asked for.
    expect(await text(handle, "what's the weather today?")).toBe(
      CHAT_REPLIES.offTopic,
    );
  });

  it("does not log statements, intentions or money coming in (HO-115)", async () => {
    const me = await linkedPhone();
    await createAccount(me.workspaceId, {
      type: "checking",
      institutionName: "Test Bank",
      nickname: "Everyday",
      maskLast4: null,
      balanceCents: cents(50_000),
    });

    for (const message of [
      "I have 500",
      "my balance is 500",
      "credit score 720",
      "need to pay rent 1200",
      "I didn't spend 20 on lunch",
    ]) {
      expect(await text(me.handle, message)).not.toMatch(
        /Logged|Which account/,
      );
    }
    expect(await text(me.handle, "got 100 from mom")).toBe(
      UNCLEAR_REPLIES.income,
    );
    expect(await text(me.handle, "paid off my card 300")).toBe(
      UNCLEAR_REPLIES.transfer,
    );
    expect(await text(me.handle, "food budget 300")).toBe(
      UNCLEAR_REPLIES.setting,
    );
    const saved = await db
      .select({ id: transaction.id })
      .from(transaction)
      .where(
        and(
          eq(transaction.workspaceId, me.workspaceId),
          eq(transaction.source, "text"),
        ),
      );
    expect(saved).toEqual([]);
  });

  it("answers photos, voice notes and edits instead of staying silent", async () => {
    const stranger = newPhone();
    expect(await text(stranger, "", { kind: "attachment" })).toBe(
      REPLIES.signUp,
    );

    const { handle } = await linkedPhone();
    expect(await text(handle, "", { kind: "attachment" })).toBe(
      CHAT_REPLIES.attachment,
    );
    expect(await text(handle, "", { kind: "voice" })).toBe(CHAT_REPLIES.voice);
    // An edit is not read again: logging it twice would be worse.
    expect(await text(handle, "15 lunch", { kind: "edit" })).toBe(
      CHAT_REPLIES.edit,
    );
  });

  it("never answers a group chat with anything about money", async () => {
    const { handle } = await linkedPhone();
    expect(await text(handle, "how am I doing?", { spaceType: "group" })).toBe(
      CHAT_REPLIES.group,
    );
  });

  it("reads six digits as a code only from a phone that is not linked", async () => {
    const { handle } = await linkedPhone();
    expect(await text(handle, "10 20 30")).not.toBe(REPLIES.alreadyLinked);
    expect(await text(handle, "link my chase account")).not.toBe(
      REPLIES.alreadyLinked,
    );
    expect(await text(handle, "LINK 123456")).toBe(REPLIES.alreadyLinked);

    // LINK on its own explains itself and does not count as a wrong code.
    const stranger = newPhone();
    for (let i = 0; i < 6; i += 1) {
      expect(await text(stranger, "LINK")).toBe(REPLIES.linkHow);
    }
    expect(await text(stranger, "LINK 000000")).toBe(REPLIES.linkFailed);
  });

  it("cancels a waiting link request on STOP, so Approve cannot text it", async () => {
    const me = await newUser();
    const handle = newPhone();
    expect(await text(handle, `LINK ${await newCode(me.userId)}`)).toBe(
      REPLIES.linkPending,
    );

    expect(await text(handle, "STOP")).toBe(REPLIES.requestCancelled);
    expect(await approveLink(me.userId, me.workspaceId)).toBeNull();
    expect(await text(handle, "how am I doing?")).toBe(REPLIES.signUp);
  });

  it("asks a phone that sends too much to slow down", async () => {
    const handle = newPhone();
    for (let i = 0; i < TURNS_PER_MINUTE; i += 1) {
      expect(await text(handle, "hello")).toBe(REPLIES.signUp);
    }
    expect(await text(handle, "hello")).toBe(CHAT_REPLIES.slowDown);
  });

  it("takes the last four digits as an answer, and keeps the question open on a non-answer", async () => {
    const me = await linkedPhone();
    const add = (nickname: string, maskLast4: string | null) =>
      createAccount(me.workspaceId, {
        type: "credit_card",
        institutionName: "Test Bank",
        nickname,
        maskLast4,
        balanceCents: cents(0),
      });
    await add("Travel card", "4521");
    await add("Grocery card", "9900");

    expect(await text(me.handle, "40 gas on card")).toBe(
      'Which account for $40.00 "gas"? Reply with its number or name: 1 Travel card, 2 Grocery card. Nothing is logged yet.',
    );
    // Not an answer and not new spending: the question stays open.
    expect(await text(me.handle, "what was it for?")).not.toMatch(/Logged/);
    expect(await text(me.handle, "card ending 4521")).toContain(
      'Logged $40.00 for "gas" today on Travel card',
    );
  });

  it("puts no digits in any fixed reply", () => {
    for (const reply of Object.values(REPLIES)) {
      expect(reply).not.toMatch(/\d/);
    }
  });
});
