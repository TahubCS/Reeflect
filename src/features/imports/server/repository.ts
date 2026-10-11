import "server-only";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { financialAccount, importBatch, transaction } from "@/lib/db/schema";
import { type Cents, cents } from "@/lib/money";
import type { Check, PreviousImport } from "../domain/checks";
import type { StatementRow } from "../domain/statement";

// Every function takes the verified workspace id first and filters on it
// (ARCH-04). Callers authorize with `requireWorkspaceAccess` before calling.

export type BatchSummary = {
  id: string;
  accountId: string;
  status: "previewed" | "committed" | "rejected";
  kind: "csv" | "pdf" | "plaid" | "nessie";
  statementInstitution: string;
  statementLast4: string;
  productName: string;
  periodStart: string;
  periodEnd: string;
  /** Null when the file had no balances (ADR-054). */
  openingBalanceCents: Cents | null;
  closingBalanceCents: Cents | null;
  rowsParsed: number;
  rowsImported: number;
  rowsSkippedDuplicate: number;
  checks: Check[];
  csvObjectKey: string;
  csvSha256: string;
};

const columns = {
  id: importBatch.id,
  accountId: importBatch.financialAccountId,
  status: importBatch.status,
  kind: importBatch.kind,
  statementInstitution: importBatch.statementInstitution,
  statementLast4: importBatch.statementLast4,
  productName: importBatch.productName,
  periodStart: importBatch.periodStart,
  periodEnd: importBatch.periodEnd,
  openingBalanceCents: importBatch.openingBalanceCents,
  closingBalanceCents: importBatch.closingBalanceCents,
  rowsParsed: importBatch.rowsParsed,
  rowsImported: importBatch.rowsImported,
  rowsSkippedDuplicate: importBatch.rowsSkippedDuplicate,
  checks: importBatch.checks,
  csvObjectKey: importBatch.csvObjectKey,
  csvSha256: importBatch.csvSha256,
};

type Row = {
  [K in keyof typeof columns]: (typeof columns)[K]["_"]["notNull"] extends true
    ? (typeof columns)[K]["_"]["data"]
    : (typeof columns)[K]["_"]["data"] | null;
};

const nullableCents = (value: number | null) =>
  value === null ? null : cents(value);

function toSummary(row: Row): BatchSummary {
  return {
    ...row,
    openingBalanceCents: nullableCents(row.openingBalanceCents),
    closingBalanceCents: nullableCents(row.closingBalanceCents),
    checks: row.checks as Check[],
  };
}

const inWorkspace = (workspaceId: string, batchId: string) =>
  and(eq(importBatch.workspaceId, workspaceId), eq(importBatch.id, batchId));

export async function getBatch(
  workspaceId: string,
  batchId: string,
): Promise<BatchSummary | null> {
  const [row] = await db
    .select(columns)
    .from(importBatch)
    .where(inWorkspace(workspaceId, batchId));
  return row ? toSummary(row) : null;
}

/** Previews waiting for a commit or a discard, newest first. */
export async function listPreviews(
  workspaceId: string,
): Promise<BatchSummary[]> {
  const rows = await db
    .select(columns)
    .from(importBatch)
    .where(
      and(
        eq(importBatch.workspaceId, workspaceId),
        eq(importBatch.status, "previewed"),
      ),
    )
    .orderBy(desc(importBatch.createdAt));
  return rows.map(toSummary);
}

/** What earlier commits to this account say about this one (ADR-010). */
export async function importHistory(
  workspaceId: string,
  accountId: string,
  fileSha256: string,
): Promise<{ duplicateFile: boolean; previous: PreviousImport[] }> {
  const rows = await db
    .select({
      fileSha256: importBatch.fileSha256,
      periodStart: importBatch.periodStart,
      periodEnd: importBatch.periodEnd,
      closingBalanceCents: importBatch.closingBalanceCents,
    })
    .from(importBatch)
    .where(
      and(
        eq(importBatch.workspaceId, workspaceId),
        eq(importBatch.financialAccountId, accountId),
        eq(importBatch.status, "committed"),
      ),
    );
  return {
    duplicateFile: rows.some((row) => row.fileSha256 === fileSha256),
    previous: rows.map(({ periodStart, periodEnd, closingBalanceCents }) => ({
      periodStart,
      periodEnd,
      closingBalanceCents: nullableCents(closingBalanceCents),
    })),
  };
}

/** Whether anything has been committed to this account yet. */
export async function hasCommittedImport(
  workspaceId: string,
  accountId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: importBatch.id })
    .from(importBatch)
    .where(
      and(
        eq(importBatch.workspaceId, workspaceId),
        eq(importBatch.financialAccountId, accountId),
        eq(importBatch.status, "committed"),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** The fingerprints from `candidates` already on this account. */
export async function existingFingerprints(
  workspaceId: string,
  accountId: string,
  candidates: readonly string[],
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const rows = await db
    .select({ fingerprint: transaction.fingerprint })
    .from(transaction)
    .where(
      and(
        eq(transaction.workspaceId, workspaceId),
        eq(transaction.financialAccountId, accountId),
        inArray(transaction.fingerprint, [...candidates]),
      ),
    );
  return new Set(rows.map((row) => row.fingerprint));
}

export type NewPreview = {
  id: string;
  kind: "csv" | "pdf";
  accountId: string;
  createdBy: string;
  fileSha256: string;
  statementInstitution: string;
  statementLast4: string;
  productName: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: Cents | null;
  closingBalanceCents: Cents | null;
  rowsParsed: number;
  rowsSkippedDuplicate: number;
  checks: Check[];
  csvObjectKey: string;
  csvSha256: string;
};

/**
 * Saves a preview. An earlier preview of the same file on the same account
 * is replaced; the keys of its CSVs are returned so they can be deleted.
 * Null when the account is not in this workspace.
 */
export async function savePreview(
  workspaceId: string,
  preview: NewPreview,
): Promise<{ replacedKeys: string[] } | null> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: financialAccount.id })
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.workspaceId, workspaceId),
          eq(financialAccount.id, preview.accountId),
        ),
      );
    if (!account) return null;
    const replaced = await tx
      .delete(importBatch)
      .where(
        and(
          eq(importBatch.workspaceId, workspaceId),
          eq(importBatch.financialAccountId, preview.accountId),
          eq(importBatch.fileSha256, preview.fileSha256),
          eq(importBatch.status, "previewed"),
        ),
      )
      .returning({ key: importBatch.csvObjectKey });
    await tx.insert(importBatch).values({
      id: preview.id,
      workspaceId,
      financialAccountId: preview.accountId,
      kind: preview.kind,
      createdBy: preview.createdBy,
      fileSha256: preview.fileSha256,
      statementInstitution: preview.statementInstitution,
      statementLast4: preview.statementLast4,
      productName: preview.productName,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
      openingBalanceCents: preview.openingBalanceCents,
      closingBalanceCents: preview.closingBalanceCents,
      // A preview is only saved when no check blocks, so balances that
      // exist have reconciled; a file without balances has nothing to add up.
      reconciliation:
        preview.closingBalanceCents === null ? "not_applicable" : "passed",
      rowsParsed: preview.rowsParsed,
      rowsSkippedDuplicate: preview.rowsSkippedDuplicate,
      checks: preview.checks,
      csvObjectKey: preview.csvObjectKey,
      csvSha256: preview.csvSha256,
      status: "previewed",
    });
    return { replacedKeys: replaced.map((row) => row.key) };
  });
}

export type CommitResult =
  | { status: "committed"; imported: number; skipped: number }
  | { status: "not found" };

/**
 * Adds a previewed batch's rows to its account in one database transaction
 * (ADR-010) and marks the batch committed. Rows whose fingerprint is
 * already on the account are skipped. A batch that is not `previewed` (for
 * example committed a moment ago in another tab) is left alone. Imported
 * rows never move the stored balance; the statement's closing balance
 * replaces a typed one only when the statement ends on or after the date
 * that balance was typed (ADR-053), and only when the file has balances.
 */
export async function commitBatch(
  workspaceId: string,
  batchId: string,
  rows: readonly StatementRow[],
  rowFingerprints: readonly string[],
): Promise<CommitResult> {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .select({
        accountId: importBatch.financialAccountId,
        kind: importBatch.kind,
        periodEnd: importBatch.periodEnd,
        closingBalanceCents: importBatch.closingBalanceCents,
      })
      .from(importBatch)
      .where(
        and(
          inWorkspace(workspaceId, batchId),
          eq(importBatch.status, "previewed"),
        ),
      )
      .for("update");
    if (!batch) return { status: "not found" };

    const values = rows.map((row, index) => ({
      workspaceId,
      financialAccountId: batch.accountId,
      postedOn: row.postedOn,
      amountCents: row.amountCents,
      descriptionRaw: row.description,
      status: "posted" as const,
      source: batch.kind,
      fingerprint: rowFingerprints[index]!,
      importBatchId: batchId,
    }));
    let imported = 0;
    // Postgres caps the number of parameters per statement, so insert in chunks.
    for (let start = 0; start < values.length; start += 500) {
      const inserted = await tx
        .insert(transaction)
        .values(values.slice(start, start + 500))
        .onConflictDoNothing({
          target: [transaction.financialAccountId, transaction.fingerprint],
        })
        .returning({ id: transaction.id });
      imported += inserted.length;
    }

    // A file without balances (a card's CSV export) leaves the balance alone.
    if (batch.closingBalanceCents !== null) {
      await tx
        .update(financialAccount)
        .set({
          currentBalanceCents: batch.closingBalanceCents,
          balanceAsOf: batch.periodEnd,
        })
        .where(
          and(
            eq(financialAccount.workspaceId, workspaceId),
            eq(financialAccount.id, batch.accountId),
            eq(financialAccount.source, "manual"),
            or(
              isNull(financialAccount.balanceAsOf),
              lte(financialAccount.balanceAsOf, batch.periodEnd),
            ),
          ),
        );
    }

    const skipped = rows.length - imported;
    await tx
      .update(importBatch)
      .set({
        status: "committed",
        rowsImported: imported,
        rowsSkippedDuplicate: skipped,
        committedAt: new Date(),
      })
      .where(inWorkspace(workspaceId, batchId));
    return { status: "committed", imported, skipped };
  });
}

/**
 * Deletes a preview that was not committed and returns its CSV's key, or
 * null when there is no such preview in this workspace.
 */
export async function deletePreview(
  workspaceId: string,
  batchId: string,
): Promise<string | null> {
  const [deleted] = await db
    .delete(importBatch)
    .where(
      and(
        inWorkspace(workspaceId, batchId),
        eq(importBatch.status, "previewed"),
      ),
    )
    .returning({ key: importBatch.csvObjectKey });
  return deleted?.key ?? null;
}
