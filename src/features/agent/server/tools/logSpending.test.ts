import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import {
  createAccount,
  getAccount,
} from "@/features/accounts/server/repository";
import { readBudgetMonth } from "@/features/budgets";
import { ensureCategories, listCategories } from "@/features/categorization";
import { createTransaction } from "@/features/transactions/server/repository";
import type { AiRequest } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { budget, financialAccount, transaction } from "@/lib/db/schema";
import { cents, formatCents } from "@/lib/money";
import { fixtures } from "../../../../../tests/support/db-fixtures";
import { parseLog } from "../../domain/log";
import { LOG_REPLIES, UNCLEAR_REPLIES } from "../../domain/log-replies";
import {
  MAX_LOGS_PER_DAY,
  type LogContext,
  logSpending,
  logTransactionId,
} from "./logSpending";
import { categoryRequest, matchCategory } from "../../domain/category-pick";

// Integration tests against the Docker database (TEST-05). The model is a
// fake; everything else is the real path a text takes after the phone's
// link has been verified.

const f = fixtures();
const NOW = new Date();
const TODAY = isoDateIn(NOW, DEFAULT_TIME_ZONE);
const YESTERDAY = isoDateIn(
  new Date(NOW.getTime() - 86_400_000),
  DEFAULT_TIME_ZONE,
);

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
  return { workspaceId, account };
}

/** No model unless a test gives one: the category then stays as the rules left it. */
const noModel = vi.fn<(request: AiRequest) => Promise<string>>(async () => {
  throw new Error("no model in this test");
});

function sender(workspaceId: string, generate = noModel) {
  const identityId = crypto.randomUUID();
  return (message: string, changes: Partial<LogContext> = {}) => {
    const command = parseLog(message);
    if (command.type === "none") throw new Error(`not a log: ${message}`);
    return logSpending(command, {
      workspaceId,
      identityId,
      messageId: crypto.randomUUID(),
      now: NOW,
      generate,
      ...changes,
    });
  };
}

const textRows = (workspaceId: string) =>
  db
    .select({
      id: transaction.id,
      accountId: transaction.financialAccountId,
      postedOn: transaction.postedOn,
      amountCents: transaction.amountCents,
      description: transaction.descriptionRaw,
      status: transaction.status,
      source: transaction.source,
      categoryId: transaction.categoryId,
      categoryIsManual: transaction.categoryIsManual,
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.workspaceId, workspaceId),
        eq(transaction.source, "text"),
      ),
    );

const balanceOf = async (workspaceId: string, accountId: string) =>
  (await getAccount(workspaceId, accountId))!.balanceCents;

const categoryId = async (workspaceId: string, presetKey: string) =>
  (await listCategories(workspaceId)).find((c) => c.presetKey === presetKey)!
    .id;

afterEach(() => {
  vi.restoreAllMocks();
  noModel.mockClear();
});

afterAll(async () => {
  await f.cleanUp();
});

describe("logging spending", () => {
  it("saves one text transaction and moves a hand-entered balance", async () => {
    const { workspaceId, account } = await workspace();
    const everyday = await account("checking", "Everyday");
    const text = sender(workspaceId);

    const reply = await text("12 lunch");

    expect(reply).toBe(
      'Logged $12.00 for "lunch" today, in Dining. Text UNDO to remove it.',
    );
    expect(await textRows(workspaceId)).toEqual([
      expect.objectContaining({
        accountId: everyday,
        postedOn: TODAY,
        amountCents: -1200,
        description: "lunch",
        status: "posted",
        source: "text",
      }),
    ]);
    expect(await balanceOf(workspaceId, everyday)).toBe(98_800);
    // The rules chose the category, so no model was asked.
    expect(noModel).not.toHaveBeenCalled();
  });

  it("logs for yesterday when the text says so", async () => {
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");

    const reply = await sender(workspaceId)("spent $8.50 on coffee yesterday");

    expect(reply).toContain('Logged $8.50 for "coffee" yesterday');
    expect((await textRows(workspaceId))[0]).toMatchObject({
      postedOn: YESTERDAY,
      amountCents: -850,
    });
  });

  it("does not move the balance of an account fed by statements", async () => {
    const { workspaceId, account } = await workspace();
    const imported = await account("checking", "Everyday");
    await db
      .update(financialAccount)
      .set({ source: "csv" })
      .where(eq(financialAccount.id, imported));

    await sender(workspaceId)("12 lunch");

    expect(await textRows(workspaceId)).toHaveLength(1);
    expect(await balanceOf(workspaceId, imported)).toBe(100_000);
  });

  it("is saved once when the same text is delivered twice", async () => {
    const { workspaceId, account } = await workspace();
    const everyday = await account("checking", "Everyday");
    const text = sender(workspaceId);
    const messageId = "spc-msg-delivered-twice";

    const first = await text("12 lunch", { messageId });
    const second = await text("12 lunch", { messageId });

    expect(second).toBe(first);
    expect(await textRows(workspaceId)).toHaveLength(1);
    expect(await balanceOf(workspaceId, everyday)).toBe(98_800);
  });

  it("gives every message its own id, shaped as a UUID", () => {
    const a = logTransactionId("identity", "m1");
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(logTransactionId("identity", "m1")).toBe(a);
    expect(logTransactionId("identity", "m2")).not.toBe(a);
    expect(logTransactionId("other", "m1")).not.toBe(a);
  });
});

describe("which account", () => {
  it("asks when there are several and none is named, and saves nothing", async () => {
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");
    await account("credit_card", "Quicksilver", -5_000);

    const reply = await sender(workspaceId)("12 lunch");

    expect(reply).toBe(
      'Which account? Send it again with the account at the end, like "12 lunch from Everyday". Your accounts: Everyday, Quicksilver. Nothing was logged.',
    );
    expect(await textRows(workspaceId)).toEqual([]);
  });

  it("uses the account named by nickname or by kind, and names it back", async () => {
    const { workspaceId, account } = await workspace();
    const everyday = await account("checking", "Everyday");
    const card = await account("credit_card", "Quicksilver", -5_000);
    const text = sender(workspaceId);

    expect(await text("12 lunch from Everyday")).toContain(
      'Logged $12.00 for "lunch" today on Everyday',
    );
    expect(await text("40 gas on card")).toContain(
      'Logged $40.00 for "gas" today on Quicksilver',
    );

    const rows = await textRows(workspaceId);
    expect(rows.find((row) => row.description === "lunch")!.accountId).toBe(
      everyday,
    );
    expect(rows.find((row) => row.description === "gas")!.accountId).toBe(card);
    // A card purchase makes what is owed larger.
    expect(await balanceOf(workspaceId, card)).toBe(-9_000);
  });

  it("asks when the named account is not one of theirs", async () => {
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");
    await account("savings", "Rainy Day");

    expect(await sender(workspaceId)("12 lunch on card")).toContain(
      "Which account?",
    );
    expect(await textRows(workspaceId)).toEqual([]);
  });

  it("never logs on a loan, and needs an account to exist", async () => {
    const loans = await workspace();
    await loans.account("checking", "Everyday");
    await loans.account("loan", "Car loan", -900_000);
    expect(await sender(loans.workspaceId)("12 lunch from car loan")).toBe(
      LOG_REPLIES.loan,
    );

    const empty = await workspace();
    expect(await sender(empty.workspaceId)("12 lunch")).toBe(
      LOG_REPLIES.noAccounts,
    );
    expect(await textRows(loans.workspaceId)).toEqual([]);
  });

  it("asks what it was for when only the account was named", async () => {
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");
    await account("credit_card", "Quicksilver", -5_000);

    expect(await sender(workspaceId)("12 on card")).toBe(
      UNCLEAR_REPLIES.no_description,
    );
    expect(await textRows(workspaceId)).toEqual([]);
  });
});

describe("the category", () => {
  it("asks a model only when the rules find none, and checks its answer", async () => {
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");
    const generate = vi.fn<(request: AiRequest) => Promise<string>>(
      async () => "Dining",
    );

    const reply = await sender(workspaceId, generate)("12 luch");

    expect(reply).toBe(
      'Logged $12.00 for "luch" today, in Dining. Text UNDO to remove it.',
    );
    expect((await textRows(workspaceId))[0]).toMatchObject({
      categoryId: await categoryId(workspaceId, "dining"),
      categoryIsManual: true,
    });
    // The model saw their words and the category names, and no amount.
    const sent = generate.mock.calls[0]![0];
    expect(sent.user).toContain("luch");
    expect(sent.user).toContain("- Dining");
    expect(sent.user).not.toContain("- Income");
    expect(`${sent.system}\n${sent.user}`).not.toMatch(/12|\$/);
  });

  it.each([
    ["a name that is not on the list", "Investments"],
    ["none", "none"],
    ["an empty answer", ""],
    ["a sentence", "I think this is Dining because of the word."],
  ])("stays uncategorized when the model answers %s", async (_case, answer) => {
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");
    const generate = vi.fn<(request: AiRequest) => Promise<string>>(
      async () => answer,
    );

    const reply = await sender(workspaceId, generate)("12 zzqx");

    expect(reply).toBe(
      'Logged $12.00 for "zzqx" today. Text UNDO to remove it.',
    );
    expect((await textRows(workspaceId))[0]!.categoryId).toBeNull();
  });

  it("still logs when the model fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");

    const reply = await sender(workspaceId)("12 zzqx");

    expect(reply).toBe(
      'Logged $12.00 for "zzqx" today. Text UNDO to remove it.',
    );
    expect(await textRows(workspaceId)).toHaveLength(1);
  });

  it("matches a model's answer to exactly one category name", () => {
    const list = [
      { id: "1", name: "Dining" },
      { id: "2", name: "Groceries" },
    ];
    expect(matchCategory("Dining", list)?.id).toBe("1");
    expect(matchCategory('  "dining". ', list)?.id).toBe("1");
    expect(matchCategory("- Groceries", list)?.id).toBe("2");
    expect(matchCategory("Dinin", list)).toBeNull();
    expect(matchCategory("NONE", list)).toBeNull();
    expect(
      matchCategory("Groceries", [...list, { id: "3", name: "groceries" }]),
    ).toBeNull();
    expect(categoryRequest("luch", list).user).toContain("-----\nluch\n-----");
  });
});

describe("the budget line", () => {
  it("says what is left when that category has a budget this month", async () => {
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");
    await ensureCategories(workspaceId);
    const dining = await categoryId(workspaceId, "dining");
    await db.insert(budget).values({
      workspaceId,
      month: TODAY.slice(0, 7),
      categoryId: dining,
      amountCents: 10_000,
    });

    const reply = await sender(workspaceId)("12 lunch");

    const month = await readBudgetMonth(workspaceId, TODAY.slice(0, 7), TODAY);
    const left = month.rows.find((row) => row.id === dining)!.remaining!;
    expect(left).toBe(8_800);
    expect(reply).toBe(
      `Logged $12.00 for "lunch" today, in Dining. ${formatCents(left)} left in Dining this month. Text UNDO to remove it.`,
    );
  });

  it("is left out when the budget is used up", async () => {
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");
    await ensureCategories(workspaceId);
    await db.insert(budget).values({
      workspaceId,
      month: TODAY.slice(0, 7),
      categoryId: await categoryId(workspaceId, "dining"),
      amountCents: 1_000,
    });

    expect(await sender(workspaceId)("12 lunch")).toBe(
      'Logged $12.00 for "lunch" today, in Dining. Text UNDO to remove it.',
    );
  });
});

describe("UNDO", () => {
  it("removes the last thing logged by text and puts the balance back", async () => {
    const { workspaceId, account } = await workspace();
    const everyday = await account("checking", "Everyday");
    const text = sender(workspaceId);
    await text("12 lunch");
    await text("5 gum", { now: new Date(NOW.getTime() + 1000) });

    expect(await text("undo")).toBe('Removed $5.00 for "gum".');
    expect(await balanceOf(workspaceId, everyday)).toBe(98_800);
    expect(await text("undo")).toBe('Removed $12.00 for "lunch".');
    expect(await balanceOf(workspaceId, everyday)).toBe(100_000);
    expect(await text("undo")).toBe(LOG_REPLIES.nothingToUndo);
    expect(await textRows(workspaceId)).toEqual([]);
  });

  it("never removes a row typed on the website, or another workspace's", async () => {
    const mine = await workspace();
    const everyday = await mine.account("checking", "Everyday");
    await createTransaction(mine.workspaceId, {
      description: "typed on the website",
      isTransfer: false,
      ledger: {
        accountId: everyday,
        postedOn: TODAY,
        amountCents: cents(-700),
        status: "posted",
      },
    });
    const theirs = await workspace();
    await theirs.account("checking", "Everyday");
    await sender(theirs.workspaceId)("12 lunch");

    expect(await sender(mine.workspaceId)("undo")).toBe(
      LOG_REPLIES.nothingToUndo,
    );
    expect(await balanceOf(mine.workspaceId, everyday)).toBe(99_300);
    expect(await textRows(theirs.workspaceId)).toHaveLength(1);
  });

  it("does not reach back more than a day", async () => {
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday");
    const text = sender(workspaceId);
    await text("12 lunch");

    const later = new Date(NOW.getTime() + 25 * 60 * 60 * 1000);
    expect(await text("undo", { now: later })).toBe(LOG_REPLIES.nothingToUndo);
    expect(await textRows(workspaceId)).toHaveLength(1);
  });
});

describe("limits and failures", () => {
  it("stops at the daily limit", async () => {
    const { workspaceId, account } = await workspace();
    const everyday = await account("checking", "Everyday");
    await db.insert(transaction).values(
      Array.from({ length: MAX_LOGS_PER_DAY }, (_, index) => ({
        workspaceId,
        financialAccountId: everyday,
        postedOn: TODAY,
        amountCents: -100,
        descriptionRaw: `row ${index}`,
        source: "text" as const,
        fingerprint: `test:${index}`,
      })),
    );

    expect(await sender(workspaceId)("12 lunch")).toBe(LOG_REPLIES.tooMany);
    expect(await textRows(workspaceId)).toHaveLength(MAX_LOGS_PER_DAY);
  });

  it("says nothing was logged when saving fails, and logs ids only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const command = parseLog("12 secret lunch");
    if (command.type === "none") throw new Error("expected a log");

    // A workspace id that is not one: the database refuses it.
    const reply = await logSpending(command, {
      workspaceId: "not a workspace\u0000",
      identityId: "identity",
      messageId: "m-fail",
      now: NOW,
    });

    expect(reply).toBe(LOG_REPLIES.notSaved);
    const output = JSON.stringify(logged.mock.calls);
    expect(output).toContain("m-fail");
    expect(output).not.toContain("secret lunch");
  });

  it("answers an unclear text without touching the database", async () => {
    const command = parseLog("12 lunch and 5 coffee");
    if (command.type === "none") throw new Error("expected unclear");

    expect(
      await logSpending(command, {
        workspaceId: "unused",
        identityId: "unused",
        messageId: "m",
      }),
    ).toBe(UNCLEAR_REPLIES.several_amounts);
  });
});
