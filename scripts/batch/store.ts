// Batch reads and writes. Loading is one database transaction: a failure
// part-way leaves nothing behind (TEST-05).
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { type WorkspaceData, sampleFigures } from "@/features/insights";
import * as schema from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { type BatchRows, type PersonRows, presetCategoryRows } from "./rows";

const {
  category,
  categoryRule,
  financialAccount,
  insightSample,
  member,
  organization,
  syntheticBatch,
  syntheticWorkspace,
  transaction,
} = schema;

export type Db = NodePgDatabase<typeof schema>;
type Executor = Pick<Db, "select" | "insert" | "delete">;

export function connect(url: string): { db: Db; close: () => Promise<void> } {
  const pool = new pg.Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 15_000,
  });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

// Postgres allows 65,535 parameters per statement; 15 columns × 1,000 rows
// stays well under it.
const CHUNK = 1_000;

async function insertChunked<T extends Record<string, unknown>>(
  insert: (rows: T[]) => Promise<unknown>,
  rows: readonly T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await insert(rows.slice(i, i + CHUNK));
  }
}

export async function insertBatch(
  db: Db,
  batch: typeof syntheticBatch.$inferInsert & { id: string },
  rows: BatchRows,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(syntheticBatch).values(batch);
    await insertChunked(
      (r) => tx.insert(organization).values(r),
      rows.organizations,
    );
    await insertChunked(
      (r) => tx.insert(syntheticWorkspace).values(r),
      rows.markers,
    );
    await insertChunked((r) => tx.insert(category).values(r), rows.categories);
    await insertChunked((r) => tx.insert(categoryRule).values(r), rows.rules);
    await insertChunked(
      (r) => tx.insert(financialAccount).values(r),
      rows.accounts,
    );
    await insertChunked(
      (r) => tx.insert(transaction).values(r),
      rows.transactions,
    );
    // Figures for the insights comparison, from the rows just written
    // (ADR-056), so they can never disagree with them.
    await writeSampleFigures(tx, batch.id, batch.asOf);
  });
}

/**
 * Recomputes the batch's `insight_sample` rows from its database rows: the
 * backfill for batches loaded before the table existed, or after developers
 * edited a sample workspace (ADR-056). Returns how many rows it wrote.
 */
export async function rollupBatch(db: Db, batchId: string): Promise<number> {
  const batch = await getBatch(db, batchId);
  if (!batch) throw new Error(`No batch ${batchId}`);
  return db.transaction((tx) => writeSampleFigures(tx, batchId, batch.asOf));
}

function byWorkspace<T extends { workspaceId: string }>(
  rows: readonly T[],
): Map<string, Omit<T, "workspaceId">[]> {
  const map = new Map<string, Omit<T, "workspaceId">[]>();
  for (const { workspaceId, ...rest } of rows) {
    const list = map.get(workspaceId) ?? [];
    list.push(rest);
    map.set(workspaceId, list);
  }
  return map;
}

async function writeSampleFigures(
  db: Executor,
  batchId: string,
  asOf: string,
): Promise<number> {
  const workspaces = db
    .select({ id: syntheticWorkspace.workspaceId })
    .from(syntheticWorkspace)
    .where(eq(syntheticWorkspace.batchId, batchId));
  // One connection inside the transaction: one query at a time.
  const accounts = await db
    .select({
      workspaceId: financialAccount.workspaceId,
      id: financialAccount.id,
      type: financialAccount.type,
      balance: financialAccount.currentBalanceCents,
      balanceAsOf: financialAccount.balanceAsOf,
    })
    .from(financialAccount)
    .where(inArray(financialAccount.workspaceId, workspaces));
  const categories = await db
    .select({
      workspaceId: category.workspaceId,
      id: category.id,
      presetKey: category.presetKey,
    })
    .from(category)
    .where(inArray(category.workspaceId, workspaces));
  const rules = await db
    .select({
      workspaceId: categoryRule.workspaceId,
      id: categoryRule.id,
      categoryId: categoryRule.categoryId,
      pattern: categoryRule.pattern,
      matchType: categoryRule.matchType,
      priority: categoryRule.priority,
    })
    .from(categoryRule)
    .where(inArray(categoryRule.workspaceId, workspaces));
  const transactions = await db
    .select({
      workspaceId: transaction.workspaceId,
      accountId: transaction.financialAccountId,
      postedOn: transaction.postedOn,
      amount: transaction.amountCents,
      descriptionRaw: transaction.descriptionRaw,
      isTransfer: transaction.isTransfer,
      categoryId: transaction.categoryId,
      categoryIsManual: transaction.categoryIsManual,
    })
    .from(transaction)
    .where(inArray(transaction.workspaceId, workspaces))
    .orderBy(asc(transaction.postedOn));
  const accountsOf = byWorkspace(accounts);
  const categoriesOf = byWorkspace(categories);
  const rulesOf = byWorkspace(rules);
  const transactionsOf = byWorkspace(transactions);

  const rows: (typeof insightSample.$inferInsert)[] = [];
  for (const { id: workspaceId } of await workspaces) {
    const own = transactionsOf.get(workspaceId) ?? [];
    const workspace: WorkspaceData = {
      accounts: (accountsOf.get(workspaceId) ?? []).map((a) => ({
        ...a,
        balance: cents(a.balance),
      })),
      categories: categoriesOf.get(workspaceId) ?? [],
      rules: rulesOf.get(workspaceId) ?? [],
      transactions: own.map((t) => ({ ...t, amount: cents(t.amount) })),
      // Rows come oldest first.
      dataFrom: own[0]?.postedOn ?? null,
    };
    for (const figure of sampleFigures(workspace, asOf)) {
      rows.push({ batchId, workspaceId, ...figure });
    }
  }
  await db.delete(insightSample).where(eq(insightSample.batchId, batchId));
  await insertChunked((r) => db.insert(insightSample).values(r), rows);
  return rows.length;
}

export type BatchCounts = {
  workspaces: number;
  accounts: number;
  transactions: number;
};

export async function countBatchRows(
  db: Db,
  batchId: string,
): Promise<BatchCounts> {
  const workspaces = db
    .select({ id: syntheticWorkspace.workspaceId })
    .from(syntheticWorkspace)
    .where(eq(syntheticWorkspace.batchId, batchId));
  const [w] = await db
    .select({ n: count() })
    .from(syntheticWorkspace)
    .where(eq(syntheticWorkspace.batchId, batchId));
  const [a] = await db
    .select({ n: count() })
    .from(financialAccount)
    .where(inArray(financialAccount.workspaceId, workspaces));
  const [t] = await db
    .select({ n: count() })
    .from(transaction)
    .where(inArray(transaction.workspaceId, workspaces));
  return {
    workspaces: w?.n ?? 0,
    accounts: a?.n ?? 0,
    transactions: t?.n ?? 0,
  };
}

export async function countSampleFigures(
  db: Db,
  batchId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(insightSample)
    .where(eq(insightSample.batchId, batchId));
  return row?.n ?? 0;
}

export type BatchListing = {
  id: string;
  label: string;
  createdAt: Date;
  createdBy: string | null;
  seed: string;
  generatorVersion: number;
  startMonth: string;
  months: number;
  asOf: string;
  promotedFrom: string | null;
  workspaces: number;
};

export async function listBatches(db: Db): Promise<BatchListing[]> {
  return db
    .select({
      id: syntheticBatch.id,
      label: syntheticBatch.label,
      createdAt: syntheticBatch.createdAt,
      createdBy: syntheticBatch.createdBy,
      seed: syntheticBatch.seed,
      generatorVersion: syntheticBatch.generatorVersion,
      startMonth: syntheticBatch.startMonth,
      months: syntheticBatch.months,
      asOf: syntheticBatch.asOf,
      promotedFrom: syntheticBatch.promotedFrom,
      workspaces: sql<number>`(select count(*)::int from ${syntheticWorkspace} where ${syntheticWorkspace.batchId} = ${syntheticBatch.id})`,
    })
    .from(syntheticBatch)
    .orderBy(desc(syntheticBatch.createdAt));
}

export async function getBatch(
  db: Db,
  batchId: string,
): Promise<typeof syntheticBatch.$inferSelect | undefined> {
  const [batch] = await db
    .select()
    .from(syntheticBatch)
    .where(eq(syntheticBatch.id, batchId));
  return batch;
}

/**
 * Deletes the batch's workspaces (their accounts, transactions and markers
 * cascade, ADR-025), then the batch row. Returns how many workspaces went.
 */
export async function deleteBatch(db: Db, batchId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(organization)
      .where(
        inArray(
          organization.id,
          tx
            .select({ id: syntheticWorkspace.workspaceId })
            .from(syntheticWorkspace)
            .where(eq(syntheticWorkspace.batchId, batchId)),
        ),
      )
      .returning({ id: organization.id });
    await tx.delete(syntheticBatch).where(eq(syntheticBatch.id, batchId));
    return removed.length;
  });
}

// Developer accounts (ADR-059): one spec person's year written into a real
// user's Personal workspace, so the team can test Insights against the
// sample people. No `synthetic_workspace` marker: the workspace stays out
// of the comparison group.

/** As `personalSlug` in src/lib/auth/personal-workspace.ts (server-only). */
const personalSlug = (userId: string) => `personal-${userId}`;

export async function findPersonalWorkspace(
  db: Pick<Db, "select">,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: organization.id })
    .from(organization)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, userId),
      ),
    )
    .where(eq(organization.slug, personalSlug(userId)));
  return row?.id ?? null;
}

export class GiveError extends Error {}

export type GiveResult = {
  workspaceId: string;
  replaced: number;
  accounts: number;
  transactions: number;
  rules: number;
};

/**
 * Writes one person's rows into the user's Personal workspace, in one
 * transaction. Refuses if it already holds synthetic accounts, unless
 * `replace` is set, which removes those first. `build` gets the workspace
 * id and its category ids by preset key (missing presets are added).
 */
export async function giveToUser(
  db: Db,
  userId: string,
  build: (
    workspaceId: string,
    categoryIds: ReadonlyMap<string, string>,
  ) => PersonRows,
  options: { replace: boolean; newId: () => string },
): Promise<GiveResult> {
  return db.transaction(async (tx) => {
    const workspaceId = await findPersonalWorkspace(tx, userId);
    if (!workspaceId) {
      throw new GiveError(
        `User ${userId} has no Personal workspace: sign in once, then retry.`,
      );
    }
    const replaced = await removeSyntheticAccounts(tx, workspaceId, {
      dryRun: !options.replace,
    });
    if (replaced > 0 && !options.replace) {
      throw new GiveError(
        `That workspace already has ${replaced} sample account(s). Use --replace, or take-back first.`,
      );
    }

    // Seed any presets the user's first Categories visit has not made yet;
    // keep the ones that exist (the user may have renamed them).
    const { categories } = presetCategoryRows(workspaceId, options.newId);
    await tx.insert(category).values(categories).onConflictDoNothing();
    const existing = await tx
      .select({ id: category.id, presetKey: category.presetKey })
      .from(category)
      .where(eq(category.workspaceId, workspaceId));
    const categoryIds = new Map(existing.map((c) => [c.presetKey, c.id]));

    const rows = build(workspaceId, categoryIds);
    // Keep the user's own rules: add only patterns they do not have.
    const patterns = new Set(
      (
        await tx
          .select({ pattern: categoryRule.pattern })
          .from(categoryRule)
          .where(eq(categoryRule.workspaceId, workspaceId))
      ).map((r) => r.pattern),
    );
    const rules = rows.rules.filter((r) => !patterns.has(r.pattern));
    await insertChunked((r) => tx.insert(categoryRule).values(r), rules);
    await insertChunked(
      (r) => tx.insert(financialAccount).values(r),
      rows.accounts,
    );
    await insertChunked(
      (r) => tx.insert(transaction).values(r),
      rows.transactions,
    );
    return {
      workspaceId,
      replaced: options.replace ? replaced : 0,
      accounts: rows.accounts.length,
      transactions: rows.transactions.length,
      rules: rules.length,
    };
  });
}

/**
 * Removes the sample accounts from the user's Personal workspace; their
 * transactions cascade. Categories and rules stay: they are the user's now.
 * Returns how many accounts went (or would go, without `yes`).
 */
export async function takeBackFromUser(
  db: Db,
  userId: string,
  options: { yes: boolean },
): Promise<{ workspaceId: string; accounts: number }> {
  return db.transaction(async (tx) => {
    const workspaceId = await findPersonalWorkspace(tx, userId);
    if (!workspaceId)
      throw new GiveError(`User ${userId} has no Personal workspace.`);
    const accounts = await removeSyntheticAccounts(tx, workspaceId, {
      dryRun: !options.yes,
    });
    return { workspaceId, accounts };
  });
}

async function removeSyntheticAccounts(
  db: Executor,
  workspaceId: string,
  options: { dryRun: boolean },
): Promise<number> {
  const where = and(
    eq(financialAccount.workspaceId, workspaceId),
    eq(financialAccount.source, "synthetic"),
  );
  if (options.dryRun) {
    const [row] = await db
      .select({ n: count() })
      .from(financialAccount)
      .where(where);
    return row?.n ?? 0;
  }
  const removed = await db
    .delete(financialAccount)
    .where(where)
    .returning({ id: financialAccount.id });
  return removed.length;
}
