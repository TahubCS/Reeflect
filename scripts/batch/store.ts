// Batch reads and writes. Loading is one database transaction: a failure
// part-way leaves nothing behind (TEST-05).
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@/lib/db/schema";
import type { BatchRows } from "./rows";

const {
  financialAccount,
  organization,
  syntheticBatch,
  syntheticWorkspace,
  transaction,
} = schema;

export type Db = NodePgDatabase<typeof schema>;

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
    await insertChunked(
      (r) => tx.insert(financialAccount).values(r),
      rows.accounts,
    );
    await insertChunked(
      (r) => tx.insert(transaction).values(r),
      rows.transactions,
    );
  });
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
