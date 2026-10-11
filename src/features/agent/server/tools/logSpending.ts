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
import { type LogCommand, trimFiller } from "../../domain/log";
import { chooseAccount } from "../../domain/log-account";
import {
  LOG_REPLIES,
  UNCLEAR_REPLIES,
  loggedReply,
  undoneReply,
  whichAccountReply,
} from "../../domain/log-replies";
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

function dayOf(day: "today" | "yesterday", now: Date): string {
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

async function save(
  command: Extract<LogCommand, { type: "log" }>,
  context: LogContext,
): Promise<string> {
  const { workspaceId } = context;
  const now = context.now ?? new Date();

  const accounts = await listAccounts(workspaceId);
  const choice = chooseAccount(command.phrase, accounts);
  if (!choice.ok) {
    if (choice.reason === "none") return LOG_REPLIES.noAccounts;
    if (choice.reason === "loan") return LOG_REPLIES.loan;
    return whichAccountReply(
      command.amount,
      command.description,
      accounts
        .filter((account) => account.type !== "loan")
        .map((account) => account.nickname),
    );
  }
  const { account } = choice;
  const description = trimFiller(choice.rest);
  // Only the account's name was there: "12 on card".
  if (!/\p{L}/u.test(description)) return UNCLEAR_REPLIES.no_description;

  const id = logTransactionId(context.identityId, context.messageId);
  const logged = await countTextTransactions(
    workspaceId,
    new Date(now.getTime() - DAY_MS),
  );
  if (logged >= MAX_LOGS_PER_DAY) return LOG_REPLIES.tooMany;

  // The rules need the workspace's categories to exist.
  await ensureCategories(workspaceId);
  const postedOn = dayOf(command.day, now);
  const created = await createTransaction(workspaceId, {
    id,
    source: "text",
    description,
    isTransfer: false,
    ledger: {
      accountId: account.id,
      postedOn,
      amountCents: negate(command.amount),
      status: "posted",
    },
  });
  if (created === null) return LOG_REPLIES.notSaved;

  // From here on the spending is saved. The category and the budget line
  // are extras: if either fails, the reply still confirms the log.
  const extras = await categoryAndBudget(context, id, description, now).catch(
    (error: unknown) => {
      console.warn("agent: log saved without its category", {
        messageId: context.messageId,
        reason: error instanceof Error ? error.name : "unknown",
      });
      return { category: null, budgetLeft: null };
    },
  );

  return loggedReply({
    amount: command.amount,
    description,
    day: command.day,
    account: accounts.length > 1 ? account.nickname : null,
    ...extras,
  });
}

/** The saved row's category (rules first, then a model) and budget line. */
async function categoryAndBudget(
  context: LogContext,
  transactionId: string,
  description: string,
  now: Date,
): Promise<{ category: string | null; budgetLeft: Cents | null }> {
  const { workspaceId } = context;
  const categories = await listCategories(workspaceId);
  let categoryId = await ruleCategory(workspaceId, description);
  if (categoryId === null) {
    const picked = await pickCategory(
      description,
      categories
        .filter((category) => !NOT_SPENDING.has(category.presetKey))
        .map(({ id, name }) => ({ id, name })),
      context.generate,
    );
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
