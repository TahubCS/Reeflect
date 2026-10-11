import "server-only";
import { createHash } from "node:crypto";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn, listAccounts } from "@/features/accounts";
import { readBudgetMonth } from "@/features/budgets";
import {
  ensureCategories,
  getCategoryMetadata,
  listCategories,
  saveOverride,
} from "@/features/categorization";
import {
  countTextTransactions,
  createTransaction,
  deleteTransaction,
  latestTextTransaction,
} from "@/features/transactions";
import type { AiRequest } from "@/lib/ai/client";
import { type Cents, absolute, negate } from "@/lib/money";
import { type LogCommand, type LogDay, trimFiller } from "../../domain/log";
import {
  type LogAccount,
  chooseAccount,
  readAccountAnswer,
} from "../../domain/log-account";
import {
  LOG_REPLIES,
  MAX_LISTED_ACCOUNTS,
  UNCLEAR_REPLIES,
  loggedReply,
  undoneReply,
  whichAccountReply,
} from "../../domain/log-replies";
import { findPending, rememberPending, takePending } from "../pending";
import { pickCategory } from "./pickCategory";

// Saves spending a linked phone texted, and takes it back on UNDO (F-27,
// ADR-064). The workspace comes from the verified link (ADR-034), the
// amount from the person's own digits (ADR-035), and every reply is built
// by code. A model is asked for one thing only: a category name, after the
// transaction is already saved.

/** Texts one workspace may log in a day; more is a loop or a mistake. */
export const MAX_LOGS_PER_DAY = 50;

/** How far back UNDO reaches. */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Categories that are never spending (ADR-055): a model is not offered them. */
const NOT_SPENDING = new Set(["income", "retirement", "investing"]);

export type LogContext = {
  /** From the verified phone link, never from the text (ADR-034). */
  workspaceId: string;
  identityId: string;
  /** The platform's id for this text: the same text is logged once. */
  messageId: string;
  now?: Date;
  /** Replaced in tests; the real one calls Gemini. */
  generate?: (request: AiRequest) => Promise<string>;
};

/**
 * A transaction id worked out from the link and the message, shaped as a
 * UUID. A text delivered twice gives the same id, and `createTransaction`
 * adds nothing the second time.
 */
export function logTransactionId(
  identityId: string,
  messageId: string,
): string {
  const hex = createHash("sha256")
    .update(`agent-log:${identityId}:${messageId}`)
    .digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export function dayOf(day: "today" | "yesterday", now: Date): string {
  return isoDateIn(
    day === "today" ? now : new Date(now.getTime() - DAY_MS),
    DEFAULT_TIME_ZONE,
  );
}

/** The category the saved rules and keywords give these words, or null. */
async function ruleCategory(
  workspaceId: string,
  description: string,
): Promise<string | null> {
  return (await getCategoryMetadata(workspaceId, description)).categoryId;
}

/** What is left of this month's budget for a category, when one is set. */
async function budgetLeft(
  workspaceId: string,
  categoryId: string,
  today: string,
): Promise<Cents | null> {
  try {
    const month = await readBudgetMonth(workspaceId, today.slice(0, 7), today);
    const row = month.rows.find((candidate) => candidate.id === categoryId);
    // Over budget is not announced by text (ADR-042): the line is left out.
    return row?.remaining != null && row.remaining > 0 ? row.remaining : null;
  } catch (error) {
    // The log is saved either way; the line is a nicety.
    console.warn("agent: budget not read", {
      workspaceId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

/** Spending that has been read and only needs its account. */
type Spending = { amount: Cents; description: string; day: LogDay };

export const canHoldSpending = (account: LogAccount) => account.type !== "loan";

/** Categories a model may be offered: the ones that are spending. */
export const isSpendingCategory = (category: { presetKey: string }) =>
  !NOT_SPENDING.has(category.presetKey);

/**
 * Asks which account, and remembers the spending so that the next text can
 * answer with a number or a name (ADR-065). Nothing is saved.
 */
async function ask(
  spending: Spending,
  accounts: readonly LogAccount[],
  context: LogContext,
  now: Date,
): Promise<string> {
  const listed = accounts.filter(canHoldSpending).slice(0, MAX_LISTED_ACCOUNTS);
  if (listed.length === 0) return LOG_REPLIES.loan;
  await rememberPending(context, {
    amount: spending.amount,
    description: spending.description,
    day: spending.day,
    accountIds: listed.map((account) => account.id),
    askedAt: now,
  });
  return whichAccountReply(
    spending.amount,
    spending.description,
    listed.map((account) => account.nickname),
  );
}

async function save(
  command: Extract<LogCommand, { type: "log" }>,
  context: LogContext,
): Promise<string> {
  const now = context.now ?? new Date();

  const accounts = await listAccounts(context.workspaceId);
  const choice = chooseAccount(command.phrase, accounts);
  if (!choice.ok) {
    if (choice.reason === "none") return LOG_REPLIES.noAccounts;
    if (choice.reason === "loan") return LOG_REPLIES.loan;
    return ask(command, accounts, context, now);
  }
  const description = trimFiller(choice.rest);
  // Only the account's name was there: "12 on card".
  if (!/\p{L}/u.test(description)) return UNCLEAR_REPLIES.no_description;

  return saveOn(
    { amount: command.amount, description, day: command.day },
    choice.account,
    {
      postedOn: dayOf(command.day, now),
      nameAccount: accounts.length > 1,
      context,
      now,
    },
  );
}

/**
 * Saves spending on the account that has been settled, and confirms it.
 * A receipt photo's proposal (ADR-067) is saved here too, once the person
 * has said yes: `receipt` then carries the photo's message id, so one photo
 * is one transaction, and the category its question showed, so no model is
 * asked again.
 */
export async function saveOn(
  spending: Spending,
  account: LogAccount,
  how: {
    postedOn: string;
    nameAccount: boolean;
    context: LogContext;
    now: Date;
    receipt?: { messageId: string; categoryId: string | null };
  },
): Promise<string> {
  const { context, now, receipt } = how;
  const { workspaceId } = context;
  const { description } = spending;

  const id = logTransactionId(
    context.identityId,
    receipt?.messageId ?? context.messageId,
  );
  const logged = await countTextTransactions(
    workspaceId,
    new Date(now.getTime() - DAY_MS),
  );
  if (logged >= MAX_LOGS_PER_DAY) return LOG_REPLIES.tooMany;

  // The rules need the workspace's categories to exist.
  await ensureCategories(workspaceId);
  const created = await createTransaction(workspaceId, {
    id,
    source: "text",
    description,
    isTransfer: false,
    ledger: {
      accountId: account.id,
      postedOn: how.postedOn,
      amountCents: negate(spending.amount),
      status: "posted",
    },
  });
  if (created === null) return LOG_REPLIES.notSaved;

  // From here on the spending is saved. The category and the budget line
  // are extras: if either fails, the reply still confirms the log.
  const extras = await categoryAndBudget(
    context,
    id,
    description,
    now,
    receipt,
  ).catch((error: unknown) => {
    console.warn("agent: log saved without its category", {
      messageId: context.messageId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return { category: null, budgetLeft: null };
  });

  return loggedReply({
    amount: spending.amount,
    description,
    day: spending.day,
    account: how.nameAccount ? account.nickname : null,
    ...extras,
  });
}

/** The saved row's category (rules first, then a model) and budget line. */
async function categoryAndBudget(
  context: LogContext,
  transactionId: string,
  description: string,
  now: Date,
  receipt?: { categoryId: string | null },
): Promise<{ category: string | null; budgetLeft: Cents | null }> {
  const { workspaceId } = context;
  const categories = await listCategories(workspaceId);
  let categoryId = await ruleCategory(workspaceId, description);
  if (categoryId === null) {
    // A receipt's category was chosen when it was read, and shown in the
    // question the person answered: that one is used, or none.
    const picked =
      receipt === undefined
        ? await pickCategory(
            description,
            categories
              .filter(isSpendingCategory)
              .map(({ id, name }) => ({ id, name })),
            context.generate,
          )
        : (categories.find(({ id }) => id === receipt.categoryId) ?? null);
    if (
      picked !== null &&
      (await saveOverride(workspaceId, transactionId, {
        mode: "manual",
        categoryId: picked.id,
      })) === "ok"
    ) {
      categoryId = picked.id;
    }
  }
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (category === undefined) return { category: null, budgetLeft: null };
  return {
    category: category.name,
    budgetLeft: await budgetLeft(
      workspaceId,
      category.id,
      isoDateIn(now, DEFAULT_TIME_ZONE),
    ),
  };
}

async function undo(context: LogContext): Promise<string> {
  const now = context.now ?? new Date();
  const last = await latestTextTransaction(
    context.workspaceId,
    new Date(now.getTime() - UNDO_WINDOW_MS),
  );
  if (last === null) return LOG_REPLIES.nothingToUndo;
  if (!(await deleteTransaction(context.workspaceId, last.id))) {
    return LOG_REPLIES.nothingToUndo;
  }
  return undoneReply(absolute(last.amountCents), last.description);
}

/**
 * Carries out what `parseLog` read, and returns the reply. Never throws:
 * a failure is told as "nothing was logged", so a reply never claims a log
 * that did not happen.
 */
export async function logSpending(
  command: Exclude<LogCommand, { type: "none" }>,
  context: LogContext,
): Promise<string> {
  try {
    if (command.type === "unclear") return UNCLEAR_REPLIES[command.reason];
    if (command.type === "undo") return await undo(context);
    return await save(command, context);
  } catch (error) {
    // Ids only: never the text or the amount.
    console.error("agent: log failed", {
      messageId: context.messageId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return LOG_REPLIES.notSaved;
  }
}

/**
 * Reads a text as the answer to an open "which account?" (ADR-065) and
 * returns the reply, or null when no question is open or the text is not an
 * answer; the text is then handled as any other. The spending is saved on
 * the day it was first texted.
 */
export async function answerPending(
  text: string,
  context: LogContext,
): Promise<string | null> {
  const now = context.now ?? new Date();
  const pending = await findPending(context, now);
  // A receipt waiting for yes or no is not this question (ADR-067).
  if (pending === null || pending.kind !== "account") return null;

  const all = await listAccounts(context.workspaceId);
  const accounts = all.filter(canHoldSpending);
  const listed = pending.accountIds.flatMap(
    (id) => accounts.find((account) => account.id === id) ?? [],
  );
  const answer = readAccountAnswer(text, listed, accounts);
  if (answer.type === "none") return null;

  try {
    if (answer.type === "unclear") return await ask(pending, all, context, now);
    // Taken first: the same answer arriving twice is acted on once.
    if (!(await takePending(context, now))) return null;
    return await saveOn(pending, answer.account, {
      postedOn: dayOf(pending.day, pending.askedAt),
      nameAccount: all.length > 1,
      context,
      now,
    });
  } catch (error) {
    // Ids only: never the text or the amount.
    console.error("agent: log failed", {
      messageId: context.messageId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return LOG_REPLIES.notSaved;
  }
}
