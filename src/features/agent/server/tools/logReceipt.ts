import "server-only";
import type { TurnPhoto } from "@reeflect/agent-protocol";
import { listAccounts } from "@/features/accounts";
import {
  ensureCategories,
  getCategoryMetadata,
  listCategories,
} from "@/features/categorization";
import { countTextTransactions } from "@/features/transactions";
import { type AiRequest, generateFromImage } from "@/lib/ai/client";
import { env } from "@/lib/env";
import { type LogAccount, readAccountAnswer } from "../../domain/log-account";
import { LOG_REPLIES, MAX_LISTED_ACCOUNTS } from "../../domain/log-replies";
import {
  isImageOfType,
  readConfirmation,
  readReceipt,
  receiptRequest,
} from "../../domain/receipt";
import {
  DECLINED_REPLIES,
  RECEIPT_REPLIES,
  receiptQuestion,
  whichAccountForReceipt,
} from "../../domain/receipt-replies";
import {
  type PendingLog,
  clearPending,
  findPending,
  rememberPending,
  takePending,
} from "../pending";
import {
  type LogContext,
  MAX_LOGS_PER_DAY,
  answerPending,
  canHoldSpending,
  dayOf,
  isSpendingCategory,
  saveOn,
} from "./logSpending";

// A photo of a receipt becomes a question, and a "yes" makes it a
// transaction (F-29, ADR-067). The workspace comes from the verified link
// (ADR-034). A model reads the picture; code checks what it read, writes
// every reply, and saves nothing until the person has answered (ADR-035).
// The picture is held in memory for this one request and never stored or
// logged (ADR-025).

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a receipt is called when no shop name could be read. */
export const RECEIPT_DESCRIPTION = "Receipt";

export type ReceiptContext = LogContext & {
  /** Replaced in tests; otherwise the `AGENT_RECEIPT_PHOTOS` switch. */
  receiptPhotos?: boolean;
  /** Replaced in tests; the real one sends the picture to Gemini. */
  readImage?: (request: AiRequest) => Promise<string>;
};

const NOT_FORWARDED = {
  too_large: RECEIPT_REPLIES.tooLargeFile,
  unsupported: RECEIPT_REPLIES.unsupported,
  several: RECEIPT_REPLIES.several,
  unavailable: RECEIPT_REPLIES.unavailable,
} as const;

/** The question for what is waiting, with the accounts as they are now. */
function questionFor(
  pending: Pick<PendingLog, "amount" | "description">,
  categoryName: string | null,
  listed: readonly LogAccount[],
): string {
  return receiptQuestion({
    amount: pending.amount,
    merchant:
      pending.description === RECEIPT_DESCRIPTION ? null : pending.description,
    category: categoryName,
    nicknames: listed.map((account) => account.nickname),
  });
}

/** Ids and a fixed word only: never the picture or what was read from it. */
function logOutcome(context: LogContext, outcome: string): void {
  console.info("agent: receipt photo", {
    messageId: context.messageId,
    outcome,
  });
}

async function read(
  photo: Extract<TurnPhoto, { status: "attached" }>,
  context: ReceiptContext,
  now: Date,
): Promise<string> {
  const { workspaceId } = context;

  // Everything that needs no model is settled first.
  if (!isImageOfType(photo.mimeType, photo.data)) {
    return RECEIPT_REPLIES.unsupported;
  }
  const accounts = await listAccounts(workspaceId);
  if (accounts.length === 0) return LOG_REPLIES.noAccounts;
  const listed = accounts.filter(canHoldSpending).slice(0, MAX_LISTED_ACCOUNTS);
  if (listed.length === 0) return LOG_REPLIES.loan;
  const logged = await countTextTransactions(
    workspaceId,
    new Date(now.getTime() - DAY_MS),
  );
  if (logged >= MAX_LOGS_PER_DAY) return LOG_REPLIES.tooMany;

  await ensureCategories(workspaceId);
  const categories = await listCategories(workspaceId);
  const offered = categories
    .filter(isSpendingCategory)
    .map(({ id, name }) => ({ id, name }));

  let answer: string;
  try {
    // The picture and the category names: no id, account or figure.
    answer = await (context.readImage ?? generateFromImage)({
      ...receiptRequest(offered),
      image: { mimeType: photo.mimeType, data: photo.data },
    });
  } catch (error) {
    console.warn("agent: receipt not read", {
      messageId: context.messageId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return RECEIPT_REPLIES.notNow;
  }

  const result = readReceipt(answer, offered);
  if (result.type === "declined") {
    logOutcome(context, result.reason);
    return DECLINED_REPLIES[result.reason];
  }

  const description = result.merchant ?? RECEIPT_DESCRIPTION;
  // The person's own rules beat the model's choice, as for any log.
  const ruled = (await getCategoryMetadata(workspaceId, description))
    .categoryId;
  const category =
    categories.find(({ id }) => id === (ruled ?? result.category?.id)) ?? null;

  await rememberPending(context, {
    kind: "receipt",
    amount: result.amount,
    description,
    day: "today",
    accountIds: listed.map((account) => account.id),
    askedAt: now,
    categoryId: category?.id ?? null,
    messageId: context.messageId,
  });
  logOutcome(context, "asked");
  return questionFor(
    { amount: result.amount, description },
    category?.name ?? null,
    listed,
  );
}

/** The accounts a waiting receipt listed that can still hold spending. */
async function accountsFor(pending: PendingLog, workspaceId: string) {
  const all = await listAccounts(workspaceId);
  const usable = all.filter(canHoldSpending);
  const listed = pending.accountIds.flatMap(
    (id) => usable.find((account) => account.id === id) ?? [],
  );
  return { all, usable, listed };
}

/**
 * Answers a message that came with a photo. Never throws, and saves no
 * transaction: the most it does is remember a proposal for the person to
 * confirm. With the switch off it calls no model and touches nothing.
 */
export async function receivePhoto(
  photo: TurnPhoto,
  context: ReceiptContext,
): Promise<string> {
  if (!(context.receiptPhotos ?? env.AGENT_RECEIPT_PHOTOS === "on")) {
    return RECEIPT_REPLIES.off;
  }
  const now = context.now ?? new Date();
  try {
    const open = await findPending(context, now);
    // The same photo delivered again: the same question, and no second read.
    if (
      open?.kind === "receipt" &&
      open.messageId === context.messageId &&
      photo.status === "attached"
    ) {
      const { listed } = await accountsFor(open, context.workspaceId);
      const categories = await listCategories(context.workspaceId);
      return questionFor(
        open,
        categories.find(({ id }) => id === open.categoryId)?.name ?? null,
        listed,
      );
    }
    // A photo is new spending: an earlier question is no longer answered.
    await clearPending(context);
    if (photo.status !== "attached") return NOT_FORWARDED[photo.status];
    return await read(photo, context, now);
  } catch (error) {
    console.error("agent: receipt failed", {
      messageId: context.messageId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return RECEIPT_REPLIES.notNow;
  }
}

async function answerReceipt(
  pending: PendingLog,
  text: string,
  context: ReceiptContext,
  now: Date,
): Promise<string | null> {
  const confirmation = readConfirmation(text);
  if (confirmation === "no") {
    await takePending(context, now);
    return RECEIPT_REPLIES.dropped;
  }

  const { all, usable, listed } = await accountsFor(
    pending,
    context.workspaceId,
  );
  let account: LogAccount | undefined;
  if (confirmation === "yes") {
    // With several accounts, "yes" does not say which: naming one does.
    if (listed.length > 1) {
      return whichAccountForReceipt(listed.map(({ nickname }) => nickname));
    }
    account = listed[0];
  } else {
    const answer = readAccountAnswer(text, listed, usable);
    // Not an answer: the text is handled as any other, and this waits.
    if (answer.type === "none") return null;
    if (answer.type === "unclear") {
      return whichAccountForReceipt(listed.map(({ nickname }) => nickname));
    }
    account = answer.account;
  }

  // Taken first: of two answers arriving together, one saves.
  if (!(await takePending(context, now))) return RECEIPT_REPLIES.nothingWaiting;
  // The accounts it listed are gone since it was asked.
  if (account === undefined) return LOG_REPLIES.notSaved;
  return saveOn(pending, account, {
    postedOn: dayOf(pending.day, pending.askedAt),
    nameAccount: all.length > 1,
    context,
    now,
    receipt: {
      messageId: pending.messageId ?? context.messageId,
      categoryId: pending.categoryId,
    },
  });
}

/**
 * Reads a text as the answer to the one open question (ADR-065, ADR-067)
 * and returns the reply, or null when the text is not an answer; it is then
 * handled as any other. A bare yes or no with nothing waiting is told so,
 * instead of being answered as a question about money.
 */
export async function answerOpenQuestion(
  text: string,
  context: ReceiptContext,
): Promise<string | null> {
  const now = context.now ?? new Date();
  const pending = await findPending(context, now);
  if (pending === null) {
    return readConfirmation(text) === null
      ? null
      : RECEIPT_REPLIES.nothingWaiting;
  }
  if (pending.kind === "account") return answerPending(text, context);
  try {
    return await answerReceipt(pending, text, context, now);
  } catch (error) {
    // Ids only: never the text or the amount.
    console.error("agent: log failed", {
      messageId: context.messageId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return LOG_REPLIES.notSaved;
  }
}
