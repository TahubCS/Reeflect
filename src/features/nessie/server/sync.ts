import "server-only";
// Sync: Nessie is the source of truth for accounts with source 'nessie'.
// Each sync reads every record of each linked account, then makes our rows
// match: new records are added, changed ones updated, and rows whose record
// is gone from Nessie removed. All of a workspace's changes are written in
// one database transaction, so a failed Nessie call changes nothing.
import { and, eq, sql } from "drizzle-orm";
import { applyCategoryRules } from "@/features/categorization";
import { refreshRecurringSeries } from "@/features/recurring";
import { db } from "@/lib/db/client";
import { financialAccount, transaction } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { cents } from "@/lib/money";
import { type NessieClient, NessieError, nessieClient } from "../api";
import { planSync } from "../domain/diff";
import {
  type SyncedRow,
  computedBalance,
  mapAccountRecords,
} from "../domain/map";
import type { AccountRecords } from "../domain/records";
import type { SyncSummary } from "../domain/sync-state";

export type SyncResult = SyncSummary;

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function syncNessieWorkspace(
  workspaceId: string,
  options: { client?: NessieClient; now?: Date } = {},
): Promise<SyncResult> {
  const started = performance.now();
  const now = options.now ?? new Date();
  if (!options.client && !env.NESSIE_API_KEY) return { status: "not set up" };
  const client = options.client ?? nessieClient({ key: env.NESSIE_API_KEY! });

  const linked = await db
    .select({
      id: financialAccount.id,
      nessieAccountId: financialAccount.nessieAccountId,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.workspaceId, workspaceId),
        eq(financialAccount.source, "nessie"),
      ),
    );
  const accounts = linked.filter(
    (a): a is { id: string; nessieAccountId: string } => !!a.nessieAccountId,
  );
  if (accounts.length === 0) return { status: "no accounts" };

  // Read everything from Nessie first, outside the database transaction.
  let fetched: { id: string; records: AccountRecords | null }[];
  try {
    fetched = await Promise.all(
      accounts.map(async (a) => {
        const account = await client.getAccount(a.nessieAccountId);
        return {
          id: a.id,
          records: account ? await client.accountRecords(account) : null,
        };
      }),
    );
  } catch (error) {
    if (error instanceof NessieError) {
      // Method, path and status only: never the URL, which holds the key.
      console.error("nessie sync: fetch failed", {
        workspaceId,
        path: error.path,
        status: error.status,
      });
      return { status: "unreachable" };
    }
    throw error;
  }

  const totals = { added: 0, updated: 0, removed: 0, nessieRecords: 0 };
  const touched: string[] = [];
  await db.transaction(async (tx) => {
    // One sync per workspace at a time; a second waits for the first.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`nessie-sync:${workspaceId}`}))`,
    );
    for (const { id, records } of fetched) {
      if (!records) {
        // Deleted in Nessie: the account and its rows go (cascade).
        await tx
          .delete(financialAccount)
          .where(
            and(
              eq(financialAccount.workspaceId, workspaceId),
              eq(financialAccount.id, id),
            ),
          );
        continue;
      }
      const rows = mapAccountRecords(records);
      totals.nessieRecords += rows.length;
      const stored = await tx
        .select({
          id: transaction.id,
          externalId: transaction.externalId,
          postedOn: transaction.postedOn,
          amountCents: transaction.amountCents,
          descriptionRaw: transaction.descriptionRaw,
          status: transaction.status,
          isTransfer: transaction.isTransfer,
          transferPairId: transaction.transferPairId,
        })
        .from(transaction)
        .where(
          and(
            eq(transaction.workspaceId, workspaceId),
            eq(transaction.financialAccountId, id),
            eq(transaction.source, "nessie"),
          ),
        );
      const plan = planSync(
        stored.map((s) => ({
          ...s,
          externalId: s.externalId ?? "",
          amountCents: cents(s.amountCents),
        })),
        rows,
      );

      const values = (row: SyncedRow) => ({
        postedOn: row.postedOn,
        amountCents: row.amountCents,
        descriptionRaw: row.descriptionRaw,
        status: row.status,
        isTransfer: row.isTransfer,
        transferPairId: row.transferPairId,
      });
      for (let i = 0; i < plan.add.length; i += 500) {
        const inserted = await tx
          .insert(transaction)
          .values(
            plan.add.slice(i, i + 500).map((row) => ({
              ...values(row),
              workspaceId,
              financialAccountId: id,
              source: "nessie" as const,
              externalId: row.externalId,
              fingerprint: row.fingerprint,
            })),
          )
          .onConflictDoUpdate({
            target: [transaction.financialAccountId, transaction.fingerprint],
            set: { source: sql`excluded.source` },
          })
          .returning({ id: transaction.id });
        touched.push(...inserted.map((r) => r.id));
      }
      for (const { id: rowId, row } of plan.update) {
        await tx
          .update(transaction)
          .set(values(row))
          .where(
            and(
              eq(transaction.workspaceId, workspaceId),
              eq(transaction.id, rowId),
            ),
          );
        touched.push(rowId);
      }
      for (const rowId of plan.remove) {
        await tx
          .delete(transaction)
          .where(
            and(
              eq(transaction.workspaceId, workspaceId),
              eq(transaction.id, rowId),
            ),
          );
      }
      // Always written, so updated_at is the "last synced" time.
      await tx
        .update(financialAccount)
        .set({
          currentBalanceCents: computedBalance(records.account, rows),
          balanceAsOf: todayIso(now),
          updatedAt: now,
        })
        .where(
          and(
            eq(financialAccount.workspaceId, workspaceId),
            eq(financialAccount.id, id),
          ),
        );
      totals.added += plan.add.length;
      totals.updated += plan.update.length;
      totals.removed += plan.remove.length;
    }
  });

  // Like an import's post-commit hooks: the ledger is already right, so a
  // failure here only leaves categories or suggestions for the next run.
  const live = fetched.filter((f) => f.records).map((f) => f.id);
  try {
    if (touched.length > 0) await applyCategoryRules(workspaceId, touched);
    if (live.length > 0) await refreshRecurringSeries(workspaceId, live, now);
  } catch (error) {
    console.error("nessie sync: follow-up failed", {
      workspaceId,
      message: error instanceof Error ? error.name : "unknown",
    });
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transaction)
    .where(
      and(
        eq(transaction.workspaceId, workspaceId),
        eq(transaction.source, "nessie"),
      ),
    );
  return {
    status: "synced",
    accounts: live.length,
    ...totals,
    reeflectRows: count ?? 0,
    ms: Math.round(performance.now() - started),
  };
}
