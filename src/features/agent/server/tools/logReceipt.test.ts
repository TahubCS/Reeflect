import { readFileSync } from "node:fs";
import type { TurnPhoto } from "@reeflect/agent-protocol";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import {
  createAccount,
  getAccount,
} from "@/features/accounts/server/repository";
import { ensureCategories, listCategories } from "@/features/categorization";
import { createTransaction } from "@/features/transactions/server/repository";
import type { AiRequest } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import {
  agentPendingLog,
  budget,
  category,
  financialAccount,
  messagingIdentity,
  transaction,
} from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { fixtures } from "../../../../../tests/support/db-fixtures";
import { parseLog } from "../../domain/log";
import { LOG_REPLIES, UNCLEAR_REPLIES } from "../../domain/log-replies";
import {
  DECLINED_REPLIES,
  RECEIPT_REPLIES,
} from "../../domain/receipt-replies";
import { PENDING_TTL_MS } from "../pending";
import {
  type ReceiptContext,
  answerOpenQuestion,
  receivePhoto,
} from "./logReceipt";
import { MAX_LOGS_PER_DAY, logSpending } from "./logSpending";

// Integration tests against the Docker database (TEST-05). The model is a
// fake that returns what a test scripts; everything else is the real path a
// photo takes after the phone's link has been verified. The picture is a
// generated fixture (TEST-08).

const f = fixtures();
const NOW = new Date();
const TODAY = isoDateIn(NOW, DEFAULT_TIME_ZONE);

const PNG = readFileSync("tests/fixtures/receipts/normal.png", "base64");
const PHOTO: TurnPhoto = {
  status: "attached",
  mimeType: "image/png",
  data: PNG,
};

type Read = {
  kind?: string;
  merchant?: string;
  total?: string;
  currency?: string;
  category?: string;
};

/** A model that reads the photo as scripted. */
const reads = (read: Read = {}) =>
  vi.fn<(request: AiRequest) => Promise<string>>(async () =>
    JSON.stringify({
      kind: "receipt",
      merchant: "Zorblat Goods",
      total: "23.40",
      currency: "USD",
      category: "Shopping",
      ...read,
    }),
  );

/** The text model: never used for a receipt. */
const noModel = vi.fn<(request: AiRequest) => Promise<string>>(async () => {
  throw new Error("no text model in this test");
});

type Kind = "checking" | "savings" | "credit_card" | "loan";

async function workspace() {
  const userId = await f.newUser();
  const workspaceId = await f.newWorkspace({ [userId]: "owner" });
  const account = (type: Kind, nickname: string, balance = 100_000) =>
    createAccount(workspaceId, {
      type,
      institutionName: "Test Bank",
      nickname,
      maskLast4: null,
      balanceCents: cents(balance),
    });
  return { workspaceId, account, userId };
}

/** A linked phone in the workspace, as `runAgentTurn` would hand it on. */
async function phone(owner: { workspaceId: string; userId: string }) {
  const [identity] = await db
    .insert(messagingIdentity)
    .values({
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      platform: "imessage",
      handle: `+1${crypto.randomUUID()}`,
      spaceId: "space",
      verifiedAt: NOW,
    })
    .returning({ id: messagingIdentity.id });
  const context = (changes: Partial<ReceiptContext>): ReceiptContext => ({
    workspaceId: owner.workspaceId,
    identityId: identity!.id,
    messageId: crypto.randomUUID(),
    now: NOW,
    generate: noModel,
    receiptPhotos: true,
    readImage: reads(),
    ...changes,
  });
  return {
    identityId: identity!.id,
    photo: (changes: Partial<ReceiptContext> = {}, photo: TurnPhoto = PHOTO) =>
      receivePhoto(photo, context(changes)),
    /** Texts a reply; null means it was not taken as an answer. */
    text: (message: string, changes: Partial<ReceiptContext> = {}) =>
      answerOpenQuestion(message, context(changes)),
    /** Texts something that is read as a log, as `runAgentTurn` does. */
    log: (message: string) => {
      const command = parseLog(message);
      if (command.type === "none") throw new Error(`not a log: ${message}`);
      return logSpending(command, context({}));
    },
  };
}

const rows = (workspaceId: string) =>
  db
    .select({
      accountId: transaction.financialAccountId,
      postedOn: transaction.postedOn,
      amountCents: transaction.amountCents,
      description: transaction.descriptionRaw,
      source: transaction.source,
      categoryId: transaction.categoryId,
      categoryIsManual: transaction.categoryIsManual,
    })
    .from(transaction)
    .where(eq(transaction.workspaceId, workspaceId));

const waiting = (identityId: string) =>
  db
    .select()
    .from(agentPendingLog)
    .where(eq(agentPendingLog.identityId, identityId));

const balanceOf = async (workspaceId: string, accountId: string) =>
  (await getAccount(workspaceId, accountId))!.balanceCents;

const categoryId = async (workspaceId: string, presetKey: string) =>
  (await listCategories(workspaceId)).find((c) => c.presetKey === presetKey)!
    .id;

/** A workspace with one checking account and a linked phone. */
async function simple() {
  const owner = await workspace();
  const everyday = await owner.account("checking", "Everyday");
  return { ...owner, everyday, linked: await phone(owner) };
}

afterEach(() => {
  vi.restoreAllMocks();
  noModel.mockClear();
});

afterAll(async () => {
  await f.cleanUp();
});

describe("a receipt photo", () => {
  it("asks, saves nothing, and logs it on yes", async () => {
    const { workspaceId, everyday, linked } = await simple();

    const question = await linked.photo();

    expect(question).toBe(
      'I read $23.40 at "Zorblat Goods", in Shopping. Reply yes to log it, or no to drop it. Nothing is logged yet.',
    );
    expect(await rows(workspaceId)).toEqual([]);
    expect(await balanceOf(workspaceId, everyday)).toBe(100_000);
    expect(await waiting(linked.identityId)).toHaveLength(1);

    const reply = await linked.text("yes");

    expect(reply).toBe(
      'Logged $23.40 for "Zorblat Goods" today, in Shopping. Text UNDO to remove it.',
    );
    expect(await rows(workspaceId)).toEqual([
      {
        accountId: everyday,
        postedOn: TODAY,
        amountCents: -2340,
        description: "Zorblat Goods",
        source: "text",
        categoryId: await categoryId(workspaceId, "shopping"),
        categoryIsManual: true,
      },
    ]);
    expect(await balanceOf(workspaceId, everyday)).toBe(100_000 - 2340);
    expect(await waiting(linked.identityId)).toEqual([]);
    // The category came with the read: no second model was asked.
    expect(noModel).not.toHaveBeenCalled();
  });

  it("can be taken back with UNDO, like any text log", async () => {
    const { workspaceId, everyday, linked } = await simple();
    await linked.photo();
    await linked.text("Yes!");

    expect(await linked.log("undo")).toBe(
      'Removed $23.40 for "Zorblat Goods".',
    );
    expect(await rows(workspaceId)).toEqual([]);
    expect(await balanceOf(workspaceId, everyday)).toBe(100_000);
  });

  it("is dropped on no, and nothing is saved", async () => {
    const { workspaceId, everyday, linked } = await simple();
    await linked.photo();

    expect(await linked.text("no")).toBe(RECEIPT_REPLIES.dropped);

    expect(await rows(workspaceId)).toEqual([]);
    expect(await balanceOf(workspaceId, everyday)).toBe(100_000);
    expect(await waiting(linked.identityId)).toEqual([]);
    // A yes after the no has nothing to confirm.
    expect(await linked.text("yes")).toBe(RECEIPT_REPLIES.nothingWaiting);
    expect(await rows(workspaceId)).toEqual([]);
  });

  it("saves once when yes arrives twice", async () => {
    const { workspaceId, linked } = await simple();
    await linked.photo();

    const [first, second] = await Promise.all([
      linked.text("yes"),
      linked.text("yes"),
    ]);

    expect([first, second].filter((r) => r?.startsWith("Logged"))).toHaveLength(
      1,
    );
    expect([first, second]).toContain(RECEIPT_REPLIES.nothingWaiting);
    expect(await rows(workspaceId)).toHaveLength(1);
    expect(await linked.text("yes")).toBe(RECEIPT_REPLIES.nothingWaiting);
    expect(await rows(workspaceId)).toHaveLength(1);
  });

  it("is forgotten after ten minutes", async () => {
    const { workspaceId, linked } = await simple();
    await linked.photo();

    const later = new Date(NOW.getTime() + PENDING_TTL_MS + 1000);
    expect(await linked.text("yes", { now: later })).toBe(
      RECEIPT_REPLIES.nothingWaiting,
    );
    expect(await rows(workspaceId)).toEqual([]);
  });

  it("leaves other texts alone and keeps waiting", async () => {
    const { workspaceId, linked } = await simple();
    await linked.photo();

    for (const message of [
      "how am I doing?",
      "yes please log 12",
      "what was that?",
      "thanks",
    ]) {
      expect(await linked.text(message)).toBeNull();
    }
    expect(await rows(workspaceId)).toEqual([]);
    expect(await waiting(linked.identityId)).toHaveLength(1);
    expect(await linked.text("yes")).toMatch(/^Logged \$23\.40/);
  });

  it("names no shop when the name read is only digits", async () => {
    const { workspaceId, linked } = await simple();

    expect(
      await linked.photo({ readImage: reads({ merchant: "7-11 #42" }) }),
    ).toBe(
      "I read $23.40 on that receipt, in Shopping. Reply yes to log it, or no to drop it. Nothing is logged yet.",
    );
    expect(await linked.text("yes")).toBe(
      'Logged $23.40 for "Receipt" today, in Shopping. Text UNDO to remove it.',
    );
    expect((await rows(workspaceId))[0]).toMatchObject({
      description: "Receipt",
    });
  });
});

describe("the category", () => {
  it("comes from the person's rules before the model's choice", async () => {
    const { workspaceId, linked } = await simple();

    const question = await linked.photo({
      readImage: reads({ merchant: "Sample Grocery", category: "Shopping" }),
    });

    expect(question).toContain('at "Sample Grocery", in Groceries.');
    await linked.text("yes");
    expect(await rows(workspaceId)).toEqual([
      expect.objectContaining({
        categoryId: await categoryId(workspaceId, "groceries"),
        categoryIsManual: false,
      }),
    ]);
  });

  it("is left out when the model names none, or one that is not theirs", async () => {
    for (const named of ["none", "Income", "Made up"]) {
      const { workspaceId, linked } = await simple();

      const question = await linked.photo({
        readImage: reads({ category: named }),
      });

      expect(question).toBe(
        'I read $23.40 at "Zorblat Goods". Reply yes to log it, or no to drop it. Nothing is logged yet.',
      );
      expect(await linked.text("yes")).toBe(
        'Logged $23.40 for "Zorblat Goods" today. Text UNDO to remove it.',
      );
      expect((await rows(workspaceId))[0]).toMatchObject({ categoryId: null });
      expect(noModel).not.toHaveBeenCalled();
    }
  });

  it("adds what is left of that category's budget", async () => {
    const { workspaceId, linked } = await simple();
    await ensureCategories(workspaceId);
    await db.insert(budget).values({
      workspaceId,
      categoryId: await categoryId(workspaceId, "shopping"),
      month: TODAY.slice(0, 7),
      amountCents: 20_000,
    });
    await linked.photo();

    expect(await linked.text("yes")).toBe(
      'Logged $23.40 for "Zorblat Goods" today, in Shopping. $176.60 left in Shopping this month. Text UNDO to remove it.',
    );
  });

  it("is saved without one when the category was deleted meanwhile", async () => {
    const { workspaceId, linked } = await simple();
    await linked.photo();
    await db
      .delete(category)
      .where(eq(category.id, await categoryId(workspaceId, "shopping")));

    expect(await linked.text("yes")).toBe(
      'Logged $23.40 for "Zorblat Goods" today. Text UNDO to remove it.',
    );
  });
});

describe("several accounts", () => {
  async function two() {
    const owner = await workspace();
    const everyday = await owner.account("checking", "Everyday");
    const card = await owner.account("credit_card", "Card", -5_000);
    await owner.account("loan", "Car loan", -900_000);
    return { ...owner, everyday, card, linked: await phone(owner) };
  }

  it("lists them, and the account's number is the yes", async () => {
    const { workspaceId, card, linked } = await two();

    expect(await linked.photo()).toBe(
      'I read $23.40 at "Zorblat Goods", in Shopping. Reply with the account\'s number or name to log it: 1 Everyday, 2 Card. Or reply no to drop it. Nothing is logged yet.',
    );

    expect(await linked.text("2")).toBe(
      'Logged $23.40 for "Zorblat Goods" today on Card, in Shopping. Text UNDO to remove it.',
    );
    expect(await rows(workspaceId)).toEqual([
      expect.objectContaining({ accountId: card, amountCents: -2340 }),
    ]);
    expect(await balanceOf(workspaceId, card)).toBe(-5_000 - 2340);
  });

  it("takes a name or a kind of account as the answer", async () => {
    for (const answer of ["Everyday", "it was from my checking account"]) {
      const { workspaceId, everyday, linked } = await two();
      await linked.photo();

      expect(await linked.text(answer)).toMatch(
        /^Logged \$23\.40 .* on Everyday/,
      );
      expect((await rows(workspaceId))[0]).toMatchObject({
        accountId: everyday,
      });
    }
  });

  it("asks again when yes does not say which, and saves nothing", async () => {
    const { workspaceId, linked } = await two();
    await linked.photo();

    for (const answer of ["yes", "\u{1F44D}", "5", "savings"]) {
      expect(await linked.text(answer)).toBe(
        "Which account? Reply with its number or name: 1 Everyday, 2 Card. Or reply no to drop it. Nothing is logged yet.",
      );
    }
    expect(await rows(workspaceId)).toEqual([]);
    expect(await waiting(linked.identityId)).toHaveLength(1);
    expect(await linked.text("no")).toBe(RECEIPT_REPLIES.dropped);
    expect(await rows(workspaceId)).toEqual([]);
  });

  it("never logs on a loan", async () => {
    const { workspaceId, linked } = await two();
    await linked.photo();

    expect(await linked.text("3")).toMatch(/^Which account\?/);
    expect(await linked.text("Car loan")).toBeNull();
    expect(await rows(workspaceId)).toEqual([]);
  });
});

describe("what gives no proposal", () => {
  it.each([
    [{ kind: "unreadable" }, DECLINED_REPLIES.unreadable],
    [{ kind: "not_receipt" }, DECLINED_REPLIES.not_receipt],
    [{ kind: "refund" }, DECLINED_REPLIES.refund],
    [{ total: "-9.15" }, DECLINED_REPLIES.refund],
    [{ total: "" }, DECLINED_REPLIES.no_total],
    [{ total: "22.00 1.40 23.40" }, DECLINED_REPLIES.no_total],
    [{ total: "23" }, DECLINED_REPLIES.no_total],
    [{ total: "10000.00" }, UNCLEAR_REPLIES.too_large],
    [{ currency: "CAD" }, UNCLEAR_REPLIES.not_usd],
    [{ currency: "€" }, UNCLEAR_REPLIES.not_usd],
  ])("read as %j: nothing waits and nothing is saved", async (read, reply) => {
    const { workspaceId, everyday, linked } = await simple();

    expect(await linked.photo({ readImage: reads(read) })).toBe(reply);

    expect(await waiting(linked.identityId)).toEqual([]);
    expect(await rows(workspaceId)).toEqual([]);
    expect(await balanceOf(workspaceId, everyday)).toBe(100_000);
    expect(await linked.text("yes")).toBe(RECEIPT_REPLIES.nothingWaiting);
    expect(await rows(workspaceId)).toEqual([]);
  });

  it("an answer that is not the JSON asked for", async () => {
    const { workspaceId, linked } = await simple();
    const chatty = vi.fn(async () => "Sure! The total is $23.40. Reply yes.");

    expect(await linked.photo({ readImage: chatty })).toBe(
      DECLINED_REPLIES.unreadable,
    );
    expect(await waiting(linked.identityId)).toEqual([]);
    expect(await rows(workspaceId)).toEqual([]);
  });

  it("a model that fails, times out, or is not set up", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { workspaceId, linked } = await simple();
    const failing = vi.fn(async () => {
      throw new Error("deadline exceeded for +15551230001");
    });

    expect(await linked.photo({ readImage: failing })).toBe(
      RECEIPT_REPLIES.notNow,
    );
    // No key in tests: the real reader reports unavailable (ADR-059).
    expect(await linked.photo({ readImage: undefined })).toBe(
      RECEIPT_REPLIES.notNow,
    );
    expect(await waiting(linked.identityId)).toEqual([]);
    expect(await rows(workspaceId)).toEqual([]);
  });

  it.each([
    ["too_large", RECEIPT_REPLIES.tooLargeFile],
    ["unsupported", RECEIPT_REPLIES.unsupported],
    ["several", RECEIPT_REPLIES.several],
    ["unavailable", RECEIPT_REPLIES.unavailable],
  ] as const)(
    "a photo the worker could not carry: %s",
    async (status, reply) => {
      const { workspaceId, linked } = await simple();
      const readImage = reads();

      expect(await linked.photo({ readImage }, { status })).toBe(reply);

      expect(readImage).not.toHaveBeenCalled();
      expect(await waiting(linked.identityId)).toEqual([]);
      expect(await rows(workspaceId)).toEqual([]);
    },
  );

  it("bytes that are not the picture they are said to be", async () => {
    const { linked } = await simple();
    const readImage = reads();
    const pdf = Buffer.from("%PDF-1.7 not a picture").toString("base64");

    for (const photo of [
      { status: "attached", mimeType: "image/png", data: pdf },
      { status: "attached", mimeType: "image/jpeg", data: PNG },
    ] as const) {
      expect(await linked.photo({ readImage }, photo)).toBe(
        RECEIPT_REPLIES.unsupported,
      );
    }
    expect(readImage).not.toHaveBeenCalled();
  });
});

describe("before any model is asked", () => {
  it("the switch is off: one reply, no model, nothing touched", async () => {
    const { workspaceId, linked } = await simple();
    const readImage = reads();
    // A question about an account is open and stays open.
    await owedQuestion(workspaceId, linked.identityId);

    // Off is also what an unset variable means.
    for (const receiptPhotos of [false, undefined]) {
      expect(await linked.photo({ receiptPhotos, readImage })).toBe(
        RECEIPT_REPLIES.off,
      );
    }

    expect(readImage).not.toHaveBeenCalled();
    expect(await waiting(linked.identityId)).toHaveLength(1);
    expect(await rows(workspaceId)).toEqual([]);
  });

  it("no account, or only a loan", async () => {
    const readImage = reads();
    const none = await workspace();
    expect(await (await phone(none)).photo({ readImage })).toBe(
      LOG_REPLIES.noAccounts,
    );

    const loanOnly = await workspace();
    await loanOnly.account("loan", "Car loan", -900_000);
    expect(await (await phone(loanOnly)).photo({ readImage })).toBe(
      LOG_REPLIES.loan,
    );
    expect(readImage).not.toHaveBeenCalled();
  });

  it("the day's limit of logs is already reached", async () => {
    const { workspaceId, everyday, linked } = await simple();
    for (let index = 0; index < MAX_LOGS_PER_DAY; index += 1) {
      await createTransaction(workspaceId, {
        source: "text",
        description: `coffee ${index}`,
        isTransfer: false,
        ledger: {
          accountId: everyday,
          postedOn: TODAY,
          amountCents: cents(-100),
          status: "posted",
        },
      });
    }
    const readImage = reads();

    expect(await linked.photo({ readImage })).toBe(LOG_REPLIES.tooMany);
    expect(readImage).not.toHaveBeenCalled();
    expect(await waiting(linked.identityId)).toEqual([]);
  });
});

/** Leaves an open "which account?" for this phone (ADR-065). */
async function owedQuestion(workspaceId: string, identityId: string) {
  await db.insert(agentPendingLog).values({
    identityId,
    workspaceId,
    amountCents: 875,
    description: "domain",
    day: "today",
    accountIds: [],
    askedAt: NOW,
  });
}

describe("one open question", () => {
  it("a photo replaces a question about an account", async () => {
    const { workspaceId, linked } = await simple();
    await owedQuestion(workspaceId, linked.identityId);

    await linked.photo();

    expect(await waiting(linked.identityId)).toEqual([
      expect.objectContaining({
        kind: "receipt",
        amountCents: 2340,
        description: "Zorblat Goods",
      }),
    ]);
  });

  it("even a photo that cannot be read closes the earlier question", async () => {
    const { workspaceId, linked } = await simple();
    await owedQuestion(workspaceId, linked.identityId);

    await linked.photo({}, { status: "several" });

    expect(await waiting(linked.identityId)).toEqual([]);
  });

  it("a question about an account replaces a receipt, keeping none of it", async () => {
    const owner = await workspace();
    await owner.account("checking", "Everyday");
    await owner.account("credit_card", "Card", -5_000);
    const linked = await phone(owner);
    await linked.photo();

    expect(await linked.log("8.75 domain")).toMatch(
      /^Which account for \$8\.75/,
    );

    expect(await waiting(linked.identityId)).toEqual([
      expect.objectContaining({
        kind: "account",
        amountCents: 875,
        categoryId: null,
        messageId: null,
      }),
    ]);
    // "yes" answers no account question; "1" does, with the text's amount.
    expect(await linked.text("1")).toMatch(/^Logged \$8\.75 for "domain"/);
    expect(await rows(owner.workspaceId)).toEqual([
      expect.objectContaining({ amountCents: -875 }),
    ]);
  });

  it("a second photo replaces the first", async () => {
    const { workspaceId, linked } = await simple();
    await linked.photo();
    await linked.photo({
      readImage: reads({ merchant: "Other Shop", total: "5.00" }),
    });

    expect(await linked.text("yes")).toMatch(
      /^Logged \$5\.00 for "Other Shop"/,
    );
    expect(await rows(workspaceId)).toHaveLength(1);
  });

  it("the same photo delivered again is asked about once, and read once", async () => {
    const { linked } = await simple();
    const readImage = reads();
    const messageId = crypto.randomUUID();

    const first = await linked.photo({ readImage, messageId });
    const again = await linked.photo({ readImage, messageId });

    expect(again).toBe(first);
    expect(readImage).toHaveBeenCalledOnce();
    expect(await waiting(linked.identityId)).toHaveLength(1);
  });

  it("one photo is one transaction, even confirmed again after a redelivery", async () => {
    const { workspaceId, everyday, linked } = await simple();
    const messageId = crypto.randomUUID();

    await linked.photo({ messageId });
    await linked.text("yes");
    await linked.photo({ messageId });
    expect(await linked.text("yes")).toMatch(/^Logged \$23\.40/);

    expect(await rows(workspaceId)).toHaveLength(1);
    expect(await balanceOf(workspaceId, everyday)).toBe(100_000 - 2340);
  });

  it("says so when yes or no has nothing to answer", async () => {
    const { linked } = await simple();

    for (const message of ["yes", "no", "\u{1F44D}", "ok"]) {
      expect(await linked.text(message)).toBe(RECEIPT_REPLIES.nothingWaiting);
    }
    // Anything else is not an answer and goes on as before.
    expect(await linked.text("how am I doing?")).toBeNull();
  });
});

describe("isolation and privacy", () => {
  it("another phone's yes never saves this phone's receipt", async () => {
    const mine = await simple();
    const theirs = await simple();
    await mine.linked.photo();

    expect(await theirs.linked.text("yes")).toBe(
      RECEIPT_REPLIES.nothingWaiting,
    );
    // Not even with the other workspace's id beside the right phone.
    expect(
      await mine.linked.text("yes", { workspaceId: theirs.workspaceId }),
    ).toBe(RECEIPT_REPLIES.nothingWaiting);

    expect(await rows(mine.workspaceId)).toEqual([]);
    expect(await rows(theirs.workspaceId)).toEqual([]);
    expect(await waiting(mine.linked.identityId)).toHaveLength(1);
  });

  it("never logs on an account of another workspace named in the row", async () => {
    const mine = await simple();
    const theirs = await simple();
    await mine.linked.photo();
    await db
      .update(agentPendingLog)
      .set({ accountIds: [theirs.everyday] })
      .where(eq(agentPendingLog.identityId, mine.linked.identityId));

    expect(await mine.linked.text("yes")).toBe(LOG_REPLIES.notSaved);

    expect(await rows(theirs.workspaceId)).toEqual([]);
    expect(await rows(mine.workspaceId)).toEqual([]);
    expect(await balanceOf(theirs.workspaceId, theirs.everyday)).toBe(100_000);
  });

  it("sends the model the picture and category names, and nothing of theirs", async () => {
    const { workspaceId, everyday, linked } = await simple();
    const readImage = reads();

    await linked.photo({ readImage });

    const request = readImage.mock.calls[0]![0];
    expect(request.image).toEqual({ mimeType: "image/png", data: PNG });
    const words = JSON.stringify({ ...request, image: undefined });
    for (const secret of [
      workspaceId,
      linked.identityId,
      everyday,
      "Everyday",
      "Test Bank",
      "100000",
      "1,000",
    ]) {
      expect(words).not.toContain(secret);
    }
    expect(request.user).toContain("- Shopping");
    // Never offered: a receipt is spending.
    expect(request.user).not.toMatch(/- (Income|Retirement|Investing)\b/);
  });

  it("logs ids and a fixed word, never the picture or what was read", async () => {
    const spies = (["info", "warn", "error", "log"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const { linked } = await simple();

    await linked.photo();
    await linked.photo({ readImage: reads({ kind: "not_receipt" }) });
    await linked.photo({
      readImage: vi.fn(async () => {
        throw new Error("Zorblat Goods 23.40");
      }),
    });
    await linked.photo();
    await linked.text("yes");

    const output = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(output).toContain("agent: receipt photo");
    for (const secret of ["Zorblat", "23.40", "2340", PNG.slice(0, 40)]) {
      expect(output).not.toContain(secret);
    }
  });

  it("keeps nothing of the picture", async () => {
    const { linked } = await simple();
    await linked.photo();

    const [row] = await waiting(linked.identityId);
    expect(JSON.stringify(row)).not.toContain(PNG.slice(0, 40));
    expect(Object.keys(row!).sort()).toEqual(
      [
        "accountIds",
        "amountCents",
        "askedAt",
        "categoryId",
        "day",
        "description",
        "identityId",
        "kind",
        "messageId",
        "workspaceId",
      ].sort(),
    );
  });

  it("goes when the phone is unlinked or the account is deleted", async () => {
    const { workspaceId, everyday, linked } = await simple();
    await linked.photo();

    await db
      .delete(financialAccount)
      .where(
        and(
          eq(financialAccount.workspaceId, workspaceId),
          eq(financialAccount.id, everyday),
        ),
      );
    expect(await linked.text("yes")).toBe(LOG_REPLIES.notSaved);
    expect(await rows(workspaceId)).toEqual([]);

    await linked.photo();
    await db
      .delete(messagingIdentity)
      .where(eq(messagingIdentity.id, linked.identityId));
    expect(await waiting(linked.identityId)).toEqual([]);
  });
});
