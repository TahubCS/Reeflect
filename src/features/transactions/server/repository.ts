import "server-only";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getCategoryMetadata } from "@/features/categorization";
import { uuidv7 } from "@/lib/db/id";
import { category, financialAccount, transaction } from "@/lib/db/schema";
import { type Cents, add, cents, negate } from "@/lib/money";
import {
  type CalendarTransaction,
  type LedgerInput,
  type TransactionInput,
  type TransactionSummary,
  balanceEffect,
} from "../domain/transaction-input";

// Every function takes the verified workspace id first and filters on it
// (ARCH-04). Callers authorize with `requireWorkspaceAccess` before calling.
// Writes that move an account's balance (ADR-050) run in one database
// transaction with the account row locked.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const columns = {
  id: transaction.id,
  accountId: transaction.financialAccountId,
  accountNickname: financialAccount.nickname,
  accountType: financialAccount.type,
  postedOn: transaction.postedOn,
  amountCents: transaction.amountCents,
  description: transaction.descriptionRaw,
  status: transaction.status,
  isTransfer: transaction.isTransfer,
  source: transaction.source,
};

type Row = Omit<TransactionSummary, "amountCents" | "editableInFull"> & {
  amountCents: number;
};

function toSummary(row: Row): TransactionSummary {
  return {
    ...row,
    amountCents: cents(row.amountCents),
    editableInFull: row.source === "manual",
  };
}

const inWorkspace = (workspaceId: string, transactionId: string) =>
  and(
    eq(transaction.workspaceId, workspaceId),
    eq(transaction.id, transactionId),
  );

// The account is joined on both its id and the workspace, so a row can never
// show another workspace's account name.
const accountJoin = and(
  eq(financialAccount.id, transaction.financialAccountId),
  eq(financialAccount.workspaceId, transaction.workspaceId),
);

/** How many transactions the list shows. */
export const LIST_LIMIT = 200;

/**
 * The workspace's transactions, newest first, optionally for one account.
 * At most `LIST_LIMIT` rows.
 */
export async function listTransactions(
  workspaceId: string,
  options: { accountId?: string; limit?: number; offset?: number } = {},
): Promise<TransactionSummary[]> {
  const rows = await db
    .select(columns)
    .from(transaction)
    .innerJoin(financialAccount, accountJoin)
    .where(
      and(
        eq(transaction.workspaceId, workspaceId),
        options.accountId === undefined
          ? undefined
          : eq(transaction.financialAccountId, options.accountId),
      ),
    )
    .orderBy(
      desc(transaction.postedOn),
      desc(transaction.createdAt),
      desc(transaction.id),
    )
    .limit(options.limit ?? LIST_LIMIT)
    .offset(options.offset ?? 0);
  return rows.map(toSummary);
}

/**
 * The workspace's transactions dated `from` to `to` ("YYYY-MM-DD", both
 * included), oldest first, with each one's category, for the calendar
 * (F-12). Not limited to `LIST_LIMIT`: the calendar needs every row in its
 * window, and the window is a few months.
 */
export async function listTransactionsBetween(
  workspaceId: string,
  from: string,
  to: string,
): Promise<CalendarTransaction[]> {
  const rows = await db
    .select({
      id: transaction.id,
      accountId: transaction.financialAccountId,
      postedOn: transaction.postedOn,
      amountCents: transaction.amountCents,
      description: transaction.descriptionRaw,
      isTransfer: transaction.isTransfer,
      source: transaction.source,
      categoryName: category.name,
      categoryPresetKey: category.presetKey,
    })
    .from(transaction)
    .innerJoin(financialAccount, accountJoin)
    .leftJoin(
      category,
      and(
        eq(category.id, transaction.categoryId),
        eq(category.workspaceId, transaction.workspaceId),
      ),
    )
    .where(
      and(
        eq(transaction.workspaceId, workspaceId),
        gte(transaction.postedOn, from),
        lte(transaction.postedOn, to),
      ),
    )
    .orderBy(
      asc(transaction.postedOn),
      asc(transaction.createdAt),
      asc(transaction.id),
    );
  return rows.map((row) => ({
    ...row,
    amountCents: cents(row.amountCents),
    editableInFull: row.source === "manual",
  }));
}

export async function getTransaction(
  workspaceId: string,
  transactionId: string,
): Promise<TransactionSummary | null> {
  const [row] = await db
    .select(columns)
    .from(transaction)
    .innerJoin(financialAccount, accountJoin)
    .where(inWorkspace(workspaceId, transactionId));
  return row ? toSummary(row) : null;
}

/** Locks one of the workspace's accounts for a balance change. */
async function lockAccount(tx: Tx, workspaceId: string, accountId: string) {
  const [row] = await tx
    .select({
      source: financialAccount.source,
      balanceAsOf: financialAccount.balanceAsOf,
      balanceCents: financialAccount.currentBalanceCents,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.workspaceId, workspaceId),
        eq(financialAccount.id, accountId),
      ),
    )
    .for("update");
  return row ?? null;
}

async function moveBalance(
  tx: Tx,
  accountId: string,
  current: number,
  change: Cents,
): Promise<void> {
  if (change === 0) return;
  await tx
    .update(financialAccount)
    .set({ currentBalanceCents: add(cents(current), change) })
    .where(eq(financialAccount.id, accountId));
}

/**
 * Adds a transaction typed by hand to one of the workspace's accounts, and
 * moves that account's balance when ADR-050 says so. Null when the account
 * is not in this workspace.
 *
 * `id` is for a caller that must not add the same row twice, like confirming
 * a plan (ADR-102): when a transaction with that id is already in this
 * workspace, nothing is added and the balance does not move again.
 */
export async function createTransaction(
  workspaceId: string,
  input: TransactionInput & { ledger: LedgerInput; id?: string },
): Promise<string | null> {
  const { ledger } = input;
  return db.transaction(async (tx) => {
    const account = await lockAccount(tx, workspaceId, ledger.accountId);
    if (!account) return null;

    const id = input.id ?? uuidv7();
    const categoryMetadata = await getCategoryMetadata(
      workspaceId,
      input.description,
      undefined,
      tx,
    );
    const inserted = await tx
      .insert(transaction)
      .values({
        id,
        workspaceId,
        financialAccountId: ledger.accountId,
        postedOn: ledger.postedOn,
        amountCents: ledger.amountCents,
        descriptionRaw: input.description,
        ...categoryMetadata,
        status: ledger.status,
        isTransfer: input.isTransfer,
        source: "manual",
        // Typed rows are not imported, so they never collide with each other:
        // two identical coffees on one day are two transactions (ADR-050).
        fingerprint: `manual:${id}`,
      })
      .onConflictDoNothing({ target: transaction.id })
      .returning({ id: transaction.id });
    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ id: transaction.id })
        .from(transaction)
        .where(inWorkspace(workspaceId, id));
      return existing ? id : null;
    }
    await moveBalance(
      tx,
      ledger.accountId,
      account.balanceCents,
      balanceEffect(account, ledger),
    );
    return id;
  });
}

export type UpdateResult = "updated" | "not found" | "no such account";

/**
 * Updates a transaction. Account, date, amount and status change only on a
 * manual transaction and only when `input.ledger` is set; the balance effect
 * of the old values is taken back and that of the new ones applied.
 */
export async function updateTransaction(
  workspaceId: string,
  transactionId: string,
  input: TransactionInput,
): Promise<UpdateResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        accountId: transaction.financialAccountId,
        postedOn: transaction.postedOn,
        amountCents: transaction.amountCents,
        source: transaction.source,
        categoryId: transaction.categoryId,
        categoryIsManual: transaction.categoryIsManual,
      })
      .from(transaction)
      .where(inWorkspace(workspaceId, transactionId))
      .for("update");
    if (!existing) return "not found";

    const ledger = existing.source === "manual" ? input.ledger : null;
    if (ledger) {
      // Lock both accounts in id order, so two edits cannot deadlock.
      const ids = [...new Set([existing.accountId, ledger.accountId])].sort();
      const locked = new Map<
        string,
        NonNullable<Awaited<ReturnType<typeof lockAccount>>>
      >();
      for (const id of ids) {
        const account = await lockAccount(tx, workspaceId, id);
        if (account) locked.set(id, account);
      }
      const after = locked.get(ledger.accountId);
      if (!after) return "no such account";

      const before = locked.get(existing.accountId);
      const undo = before
        ? negate(
            balanceEffect(before, {
              postedOn: existing.postedOn,
              amountCents: cents(existing.amountCents),
            }),
          )
        : cents(0);
      const redo = balanceEffect(after, ledger);
      if (existing.accountId === ledger.accountId) {
        await moveBalance(
          tx,
          ledger.accountId,
          after.balanceCents,
          add(undo, redo),
        );
      } else {
        if (before) {
          await moveBalance(tx, existing.accountId, before.balanceCents, undo);
        }
        await moveBalance(tx, ledger.accountId, after.balanceCents, redo);
      }
    }

    const categoryMetadata = await getCategoryMetadata(
      workspaceId,
      input.description,
      existing,
      tx,
    );
    await tx
      .update(transaction)
      .set({
        descriptionRaw: input.description,
        ...categoryMetadata,
        isTransfer: input.isTransfer,
        ...(ledger && {
          financialAccountId: ledger.accountId,
          postedOn: ledger.postedOn,
          amountCents: ledger.amountCents,
          status: ledger.status,
        }),
      })
      .where(inWorkspace(workspaceId, transactionId));
    return "updated";
  });
}

/**
 * Deletes a transaction and takes back its balance effect. False when the
 * transaction is not in this workspace.
 */
export async function deleteTransaction(
  workspaceId: string,
  transactionId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(transaction)
      .where(inWorkspace(workspaceId, transactionId))
      .returning({
        accountId: transaction.financialAccountId,
        postedOn: transaction.postedOn,
        amountCents: transaction.amountCents,
        source: transaction.source,
      });
    if (!deleted) return false;

    if (deleted.source === "manual") {
      const account = await lockAccount(tx, workspaceId, deleted.accountId);
      if (account) {
        await moveBalance(
          tx,
          deleted.accountId,
          account.balanceCents,
          negate(
            balanceEffect(account, {
              postedOn: deleted.postedOn,
              amountCents: cents(deleted.amountCents),
            }),
          ),
        );
      }
    }
    return true;
  });
}
