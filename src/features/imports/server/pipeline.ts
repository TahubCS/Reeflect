import "server-only";
import { createHash } from "node:crypto";
import { getAccount } from "@/features/accounts";
import { uuidv7 } from "@/lib/db/id";
import type { ObjectStore } from "@/lib/storage";
import { statementCsvKey } from "@/lib/storage/keys";
import {
  type Check,
  isBlocked,
  reconciliationDifference,
  runChecks,
} from "../domain/checks";
import { parseCsv, toCsv } from "../domain/csv";
import { readRecords } from "../domain/csv-records";
import { type StatementSummary, summarize } from "../domain/preview";
import { fingerprints } from "../domain/fingerprint";
import { parseCsvStatement, parseStatement } from "../domain/parse";
import type {
  ParseFailure,
  ParseResult,
  ParsedStatement,
  StatementRow,
} from "../domain/statement";
import { toLines } from "../domain/text";
import {
  FILE_PROBLEM_TEXT,
  type FileProblem,
  MAX_CSV_ROWS,
  type StatementFormat,
  checkCsvBytes,
  checkPdfBytes,
  statementFormat,
} from "../domain/validate-file";
import { extractPdfText } from "./extract-pdf";
import {
  type BatchSummary,
  commitBatch,
  deletePreview,
  existingFingerprints,
  getBatch,
  hasCommittedImport,
  importHistory,
  savePreview,
} from "./repository";

// ARCH-05 for PDF statements and CSV exports: preview (read, check, store
// the canonical CSV, save a `previewed` batch) and commit (read the stored
// CSV back, check it again, add the rows). Only reading differs between the
// two formats; everything from the parsed statement on is shared. Callers
// authorize first; every function takes the verified workspace id. Logs
// carry ids only, never statement contents.

const sha256 = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");

const statementFacts = (statement: ParsedStatement) => ({
  institution: statement.institution,
  last4: statement.accountLast4,
  productName: statement.productName,
  periodStart: statement.periodStart,
  periodEnd: statement.periodEnd,
  openingBalanceCents: statement.openingBalanceCents,
  closingBalanceCents: statement.closingBalanceCents,
});

export type PreviewOutcome =
  | { kind: "problem"; message: string }
  | { kind: "blocked"; summary: StatementSummary; checks: Check[] }
  | { kind: "saved"; batchId: string };

function parseProblem(
  failure: ParseFailure,
  maskLast4: string | null,
  format: StatementFormat,
): string {
  if (failure.reason === "unsupported") return failure.detail;
  const file = format === "pdf" ? "statement" : "CSV";
  if (failure.reason === "no-account") {
    const found = failure.accountsFound
      .map((last4) => `••${last4}`)
      .join(" and ");
    return maskLast4 === null
      ? `This ${file} covers ${found}. Add the account's last 4 digits on the Accounts page, so the right one can be read.`
      : `This ${file} covers ${found}, but the chosen account ends in ${maskLast4}. Choose the matching account.`;
  }
  return format === "pdf"
    ? `${failure.detail} If this is a Capital One 360 statement, it may use a layout that can't be read yet.`
    : `${failure.detail} If this is a Capital One CSV export, it may use columns that can't be read yet.`;
}

type Reading =
  { ok: true; result: ParseResult } | { ok: false; problem: FileProblem };

async function readPdf(
  bytes: Uint8Array,
  maskLast4: string | null,
): Promise<Reading> {
  const fileProblem = checkPdfBytes(bytes);
  if (fileProblem) return { ok: false, problem: fileProblem };
  const extraction = await extractPdfText(bytes);
  if (!extraction.ok) return { ok: false, problem: extraction.problem };
  return {
    ok: true,
    result: parseStatement(toLines(extraction.items), maskLast4),
  };
}

function readCsv(bytes: Uint8Array, maskLast4: string | null): Reading {
  const decoded = checkCsvBytes(bytes);
  if (!decoded.ok) return decoded;
  const records = readRecords(decoded.text, "upload");
  if (!records) return { ok: false, problem: "csv-unreadable" };
  // The first record is the header.
  if (records.length - 1 > MAX_CSV_ROWS) {
    return { ok: false, problem: "too-many-rows" };
  }
  return { ok: true, result: parseCsvStatement(records, maskLast4) };
}

async function bestEffortDelete(
  store: ObjectStore,
  keys: readonly string[],
  batchId: string,
) {
  for (const key of keys) {
    try {
      await store.delete(key);
    } catch {
      console.error("imports: stored CSV not deleted", { batchId });
    }
  }
}

/**
 * Reads an uploaded PDF statement or CSV export, checks it, and saves a
 * preview. `fileName` and `contentType` come from the upload and only pick
 * the reader; a PDF is recognized by its bytes.
 */
export async function previewStatement(input: {
  workspaceId: string;
  accountId: string;
  userId: string;
  bytes: Uint8Array;
  fileName?: string;
  contentType?: string;
  store: ObjectStore;
}): Promise<PreviewOutcome> {
  const { workspaceId, accountId } = input;
  const account = await getAccount(workspaceId, accountId);
  if (!account)
    return { kind: "problem", message: "Choose one of your accounts." };

  if (input.bytes.length === 0) {
    return { kind: "problem", message: FILE_PROBLEM_TEXT.missing };
  }
  const format = statementFormat(
    input.bytes,
    input.fileName ?? "",
    input.contentType ?? "",
  );
  if (!format) {
    return { kind: "problem", message: FILE_PROBLEM_TEXT["unknown-type"] };
  }
  // Only the hash of the uploaded file is kept (ADR-025); the bytes go out
  // of scope when this function returns.
  const fileSha256 = sha256(input.bytes);
  const reading =
    format === "pdf"
      ? await readPdf(input.bytes, account.maskLast4)
      : readCsv(input.bytes, account.maskLast4);
  if (!reading.ok) {
    return { kind: "problem", message: FILE_PROBLEM_TEXT[reading.problem] };
  }
  if (!reading.result.ok) {
    return {
      kind: "problem",
      message: parseProblem(reading.result, account.maskLast4, format),
    };
  }
  return previewParsed({
    workspaceId,
    accountId,
    userId: input.userId,
    format,
    fileSha256,
    statement: reading.result.statement,
    account,
    store: input.store,
  });
}

/** Checks a parsed statement and, unless a check blocks, saves a preview. */
async function previewParsed(input: {
  workspaceId: string;
  accountId: string;
  userId: string;
  format: StatementFormat;
  fileSha256: string;
  statement: ParsedStatement;
  account: NonNullable<Awaited<ReturnType<typeof getAccount>>>;
  store: ObjectStore;
}): Promise<PreviewOutcome> {
  const { workspaceId, accountId, fileSha256, statement, account, store } =
    input;
  const csv = toCsv(statement.rows);
  const rowFingerprints = fingerprints(accountId, statement.rows);
  const [existing, history] = await Promise.all([
    existingFingerprints(workspaceId, accountId, rowFingerprints),
    importHistory(workspaceId, accountId, fileSha256),
  ]);
  const checks = runChecks({
    statement,
    csv,
    account: {
      institutionName: account.institutionName,
      maskLast4: account.maskLast4,
      type: account.type,
    },
    duplicateFile: history.duplicateFile,
    duplicateRows: rowFingerprints.filter((fingerprint) =>
      existing.has(fingerprint),
    ).length,
    previousImports: history.previous,
  });
  const summary = summarize(statementFacts(statement), statement.rows);
  // Nothing is written when a check blocks (ADR-010).
  if (isBlocked(checks)) return { kind: "blocked", summary, checks };

  const batchId = uuidv7();
  const csvObjectKey = statementCsvKey(workspaceId, accountId, batchId);
  await store.put(csvObjectKey, csv, "text/csv; charset=utf-8");
  let saved: Awaited<ReturnType<typeof savePreview>>;
  try {
    saved = await savePreview(workspaceId, {
      id: batchId,
      kind: input.format,
      accountId,
      createdBy: input.userId,
      fileSha256,
      statementInstitution: statement.institution,
      statementLast4: statement.accountLast4,
      productName: statement.productName,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      openingBalanceCents: statement.openingBalanceCents,
      closingBalanceCents: statement.closingBalanceCents,
      rowsParsed: statement.rows.length,
      rowsSkippedDuplicate: existing.size,
      checks,
      csvObjectKey,
      csvSha256: sha256(csv),
    });
  } catch (error) {
    await bestEffortDelete(store, [csvObjectKey], batchId);
    throw error;
  }
  if (!saved) {
    await bestEffortDelete(store, [csvObjectKey], batchId);
    return { kind: "problem", message: "Choose one of your accounts." };
  }
  await bestEffortDelete(store, saved.replacedKeys, batchId);
  console.info("imports: preview saved", { workspaceId, accountId, batchId });
  return { kind: "saved", batchId };
}

export type StoredRows =
  { ok: true; rows: StatementRow[] } | { ok: false; message: string };

const CHANGED =
  "The saved copy of this statement has changed since the preview, so nothing was imported. Discard it and upload the statement again.";

/**
 * Reads a batch's CSV back from storage and checks it is the file the
 * preview stored: same SHA-256, readable, same number of rows, and, when
 * the file had balances, its rows still take the opening balance to the
 * closing balance.
 */
export async function readStoredRows(
  batch: BatchSummary,
  store: ObjectStore,
): Promise<StoredRows> {
  const csv = await store.get(batch.csvObjectKey);
  if (csv === null) {
    return {
      ok: false,
      message:
        "The saved copy of this statement is missing. Discard it and upload the statement again.",
    };
  }
  if (sha256(csv) !== batch.csvSha256) return { ok: false, message: CHANGED };
  const parsed = parseCsv(csv);
  if (!parsed.ok || parsed.rows.length !== batch.rowsParsed) {
    return { ok: false, message: CHANGED };
  }
  const { openingBalanceCents: opening, closingBalanceCents: closing } = batch;
  if (
    opening !== null &&
    closing !== null &&
    reconciliationDifference(
      opening,
      parsed.rows.map((row) => row.amountCents),
      closing,
    ) !== 0
  ) {
    return { ok: false, message: CHANGED };
  }
  return { ok: true, rows: parsed.rows };
}

export type PreviewView = {
  batch: BatchSummary;
  summary: StatementSummary;
  rows: StoredRows;
  needsIdentityConfirmation: boolean;
};

/** A waiting preview with its rows read from the stored CSV. */
export async function loadPreview(
  workspaceId: string,
  batchId: string,
  store: ObjectStore,
): Promise<PreviewView | null> {
  const batch = await getBatch(workspaceId, batchId);
  if (!batch || batch.status !== "previewed") return null;
  const rows = await readStoredRows(batch, store);
  return {
    batch,
    summary: summarize(
      {
        institution: batch.statementInstitution,
        last4: batch.statementLast4,
        productName: batch.productName,
        periodStart: batch.periodStart,
        periodEnd: batch.periodEnd,
        openingBalanceCents: batch.openingBalanceCents,
        closingBalanceCents: batch.closingBalanceCents,
      },
      rows.ok ? rows.rows : [],
    ),
    rows,
    needsIdentityConfirmation: !(await hasCommittedImport(
      workspaceId,
      batch.accountId,
    )),
  };
}

export type CommitOutcome =
  | { kind: "problem"; message: string }
  | { kind: "committed"; accountId: string; imported: number; skipped: number };

const GONE =
  "This preview is no longer waiting. It may have been imported or discarded already.";

export async function commitStatement(input: {
  workspaceId: string;
  batchId: string;
  confirmIdentity: boolean;
  store: ObjectStore;
}): Promise<CommitOutcome> {
  const { workspaceId, batchId } = input;
  const batch = await getBatch(workspaceId, batchId);
  if (!batch || batch.status !== "previewed")
    return { kind: "problem", message: GONE };
  if (
    !input.confirmIdentity &&
    !(await hasCommittedImport(workspaceId, batch.accountId))
  ) {
    return {
      kind: "problem",
      message: `This is the first statement for this account. Confirm it is for ${batch.statementInstitution} ••${batch.statementLast4} to import it.`,
    };
  }
  // The rows committed are the stored file's rows, checked again here, so
  // the copy that is kept is exactly what was imported (ADR-053).
  const stored = await readStoredRows(batch, input.store);
  if (!stored.ok) return { kind: "problem", message: stored.message };
  const result = await commitBatch(
    workspaceId,
    batchId,
    stored.rows,
    fingerprints(batch.accountId, stored.rows),
  );
  if (result.status === "not found") return { kind: "problem", message: GONE };
  console.info("imports: committed", {
    workspaceId,
    batchId,
    imported: result.imported,
  });
  return {
    kind: "committed",
    accountId: batch.accountId,
    imported: result.imported,
    skipped: result.skipped,
  };
}

/** Deletes a waiting preview and its stored CSV. False when there is none. */
export async function discardPreview(
  workspaceId: string,
  batchId: string,
  store: ObjectStore,
): Promise<boolean> {
  const key = await deletePreview(workspaceId, batchId);
  if (key === null) return false;
  await bestEffortDelete(store, [key], batchId);
  return true;
}
