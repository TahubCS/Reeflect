import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAccount,
  getAccount,
} from "@/features/accounts/server/repository";
import { listTransactions } from "@/features/transactions/server/repository";
import { db } from "@/lib/db/client";
import { importBatch, transaction } from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { accountPrefix } from "@/lib/storage/keys";
import { fixtures } from "../../../../tests/support/db-fixtures";
import { testStore } from "../../../../tests/support/storage";
import { toCsv } from "../domain/csv";
import {
  commitStatement,
  discardPreview,
  loadPreview,
  previewStatement,
} from "./pipeline";
import { getBatch, listPreviews } from "./repository";

// Integration tests against the Docker database and the Neon
// `storage-tests` bucket (TEST-05, ADR-053).

const f = fixtures();
const store = testStore();
let workspace: string;
let userId: string;

const pdf = (file: string) =>
  new Uint8Array(
    readFileSync(
      new URL(`../../../../tests/fixtures/pdf/${file}`, import.meta.url),
    ),
  );

async function newAccount(
  overrides: {
    maskLast4?: string | null;
    type?: "checking" | "savings" | "credit_card";
    institutionName?: string;
  } = {},
  now = new Date("2026-09-15T12:00:00Z"),
) {
  return createAccount(
    workspace,
    {
      type: overrides.type ?? "checking",
      institutionName: overrides.institutionName ?? "Capital One",
      nickname: "Statements",
      maskLast4:
        overrides.maskLast4 === undefined ? "1234" : overrides.maskLast4,
      balanceCents: cents(100),
    },
    now,
  );
}

const preview = (accountId: string, file: string) =>
  previewStatement({
    workspaceId: workspace,
    accountId,
    userId,
    bytes: pdf(file),
    store,
  });

const csvFile = (file: string) =>
  new Uint8Array(
    readFileSync(
      new URL(`../../../../tests/fixtures/csv/${file}`, import.meta.url),
    ),
  );

const previewCsv = (accountId: string, file: string) =>
  previewStatement({
    workspaceId: workspace,
    accountId,
    userId,
    bytes: csvFile(file),
    fileName: file,
    contentType: "text/csv",
    store,
  });

async function savedCsv(accountId: string, file: string): Promise<string> {
  const outcome = await previewCsv(accountId, file);
  if (outcome.kind !== "saved")
    throw new Error(`expected a saved preview, got ${outcome.kind}`);
  return outcome.batchId;
}

const commit = (batchId: string, confirmIdentity = true) =>
  commitStatement({ workspaceId: workspace, batchId, confirmIdentity, store });

async function storedKeys(accountId: string): Promise<string[]> {
  return store.listKeys(accountPrefix(workspace, accountId));
}

async function saved(accountId: string, file: string): Promise<string> {
  const outcome = await preview(accountId, file);
  if (outcome.kind !== "saved")
    throw new Error(`expected a saved preview, got ${outcome.kind}`);
  return outcome.batchId;
}

beforeAll(async () => {
  userId = await f.newUser();
  workspace = await f.newWorkspace({ [userId]: "owner" });
});

afterAll(async () => {
  await store.deletePrefix(`w/${workspace}/`);
  await f.cleanUp();
});

describe("previewStatement", () => {
  it("stores the CSV and saves a preview that references it", async () => {
    const accountId = await newAccount();
    const batchId = await saved(accountId, "capital-one-normal.pdf");

    const batch = (await getBatch(workspace, batchId))!;
    expect(batch).toMatchObject({
      status: "previewed",
      statementInstitution: "Capital One",
      statementLast4: "1234",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      rowsParsed: 11,
      csvObjectKey: `${accountPrefix(workspace, accountId)}${batchId}.csv`,
    });
    const view = (await loadPreview(workspace, batchId, store))!;
    expect(view.rows.ok).toBe(true);
    if (view.rows.ok)
      expect(await store.get(batch.csvObjectKey)).toBe(toCsv(view.rows.rows));
    expect(view.summary).toMatchObject({
      rowCount: 11,
      moneyInCents: 292512,
      moneyOutCents: 138911,
    });
    expect(view.needsIdentityConfirmation).toBe(true);
  });

  it("stores nothing when a check blocks, and says why", async () => {
    const accountId = await newAccount();
    const outcome = await preview(accountId, "capital-one-off-by-a-cent.pdf");

    expect(outcome.kind).toBe("blocked");
    if (outcome.kind === "blocked") {
      expect(
        outcome.checks.find((check) => check.id === "reconciliation")!.outcome,
      ).toBe("block");
      expect(outcome.summary.rowCount).toBe(11);
    }
    expect(await storedKeys(accountId)).toEqual([]);
    expect(
      (await listPreviews(workspace)).some(
        (batch) => batch.accountId === accountId,
      ),
    ).toBe(false);
  });

  it("blocks a statement for another bank's account or a savings account", async () => {
    const elsewhere = await preview(
      await newAccount({ institutionName: "First Example Bank" }),
      "capital-one-normal.pdf",
    );
    expect(elsewhere.kind === "blocked" && elsewhere.checks[0]!.outcome).toBe(
      "block",
    );
    const savings = await preview(
      await newAccount({ type: "savings" }),
      "capital-one-normal.pdf",
    );
    expect(savings.kind === "blocked" && savings.checks[1]!.outcome).toBe(
      "block",
    );
  });

  it("asks for the last 4 digits when the account has none", async () => {
    const one = await preview(
      await newAccount({ maskLast4: null }),
      "capital-one-normal.pdf",
    );
    expect(one.kind === "blocked" && one.checks[0]!.detail).toContain(
      "Add the account's last 4 digits",
    );
    const several = await preview(
      await newAccount({ maskLast4: null }),
      "capital-one-multipage.pdf",
    );
    expect(several).toEqual({
      kind: "problem",
      message:
        "This statement covers ••1234 and ••5678. Add the account's last 4 digits on the Accounts page, so the right one can be read.",
    });
  });

  it.each([
    [
      "capital-one-multipage.pdf",
      "9999",
      "This statement covers ••1234 and ••5678, but the chosen account ends in 9999.",
    ],
    [
      "other-bank.pdf",
      "1234",
      "Only Capital One 360 statements can be read for now.",
    ],
    ["image-only.pdf", "1234", "looks like a scan"],
  ])("explains why %s can't be read", async (file, last4, message) => {
    const outcome = await preview(await newAccount({ maskLast4: last4 }), file);
    expect(outcome.kind).toBe("problem");
    if (outcome.kind === "problem") expect(outcome.message).toContain(message);
  });

  it("refuses bytes that aren't a PDF and accounts outside the workspace", async () => {
    const accountId = await newAccount();
    const text = await previewStatement({
      workspaceId: workspace,
      accountId,
      userId,
      bytes: new TextEncoder().encode("date,amount"),
      store,
    });
    expect(text).toEqual({
      kind: "problem",
      message: expect.stringContaining("isn't a PDF"),
    });
    const other = await f.newWorkspace({ [userId]: "owner" });
    expect(
      await previewStatement({
        workspaceId: other,
        accountId,
        userId,
        bytes: pdf("capital-one-normal.pdf"),
        store,
      }),
    ).toEqual({ kind: "problem", message: "Choose one of your accounts." });
  });

  it("replaces an earlier preview of the same file and deletes its CSV", async () => {
    const accountId = await newAccount();
    const first = await saved(accountId, "capital-one-normal.pdf");
    const second = await saved(accountId, "capital-one-normal.pdf");

    expect(await getBatch(workspace, first)).toBeNull();
    expect(await storedKeys(accountId)).toEqual([
      `${accountPrefix(workspace, accountId)}${second}.csv`,
    ]);
  });
});

describe("commitStatement", () => {
  it("asks for confirmation on an account's first import", async () => {
    const accountId = await newAccount();
    const batchId = await saved(accountId, "capital-one-normal.pdf");

    expect(await commit(batchId, false)).toEqual({
      kind: "problem",
      message:
        "This is the first statement for this account. Confirm it is for Capital One ••1234 to import it.",
    });
  });

  it("adds the stored rows, links them to the batch and takes the closing balance", async () => {
    const accountId = await newAccount();
    const batchId = await saved(accountId, "capital-one-normal.pdf");

    expect(await commit(batchId)).toEqual({
      kind: "committed",
      accountId,
      imported: 11,
      skipped: 0,
    });
    const rows = await listTransactions(workspace, { accountId });
    expect(rows).toHaveLength(11);
    expect(rows.every((row) => row.source === "pdf")).toBe(true);
    const linked = await db
      .select({ batch: transaction.importBatchId })
      .from(transaction)
      .where(eq(transaction.financialAccountId, accountId));
    expect(new Set(linked.map((row) => row.batch))).toEqual(new Set([batchId]));
    expect(await getAccount(workspace, accountId)).toMatchObject({
      balanceCents: 347601,
      balanceAsOf: "2026-09-30",
    });
    expect((await getBatch(workspace, batchId))!).toMatchObject({
      status: "committed",
      rowsImported: 11,
    });
    expect(await commit(batchId)).toMatchObject({ kind: "problem" });
  });

  it("leaves a balance typed after the statement ended alone", async () => {
    const accountId = await newAccount({}, new Date("2026-10-10T12:00:00Z"));
    await commit(await saved(accountId, "capital-one-normal.pdf"));
    expect(await getAccount(workspace, accountId)).toMatchObject({
      balanceCents: 100,
      balanceAsOf: "2026-10-10",
    });
  });

  it("blocks the same file twice and skips transactions already imported", async () => {
    const accountId = await newAccount();
    await commit(await saved(accountId, "capital-one-normal.pdf"));

    const again = await preview(accountId, "capital-one-normal.pdf");
    expect(
      again.kind === "blocked" &&
        again.checks.find((check) => check.id === "duplicate-file")!.outcome,
    ).toBe("block");

    // The same transactions in a different file: all of them are skipped.
    const overlap = await saved(accountId, "capital-one-unsigned-debits.pdf");
    const view = (await loadPreview(workspace, overlap, store))!;
    expect(view.needsIdentityConfirmation).toBe(false);
    expect(
      view.batch.checks.find((check) => check.id === "duplicate-rows")!.detail,
    ).toContain("11 transactions are already");
    expect(await commit(overlap, false)).toEqual({
      kind: "committed",
      accountId,
      imported: 0,
      skipped: 11,
    });
  });

  it("refuses a stored CSV that changed or went missing since the preview", async () => {
    const accountId = await newAccount();
    const batchId = await saved(accountId, "capital-one-normal.pdf");
    const { csvObjectKey } = (await getBatch(workspace, batchId))!;
    const original = (await store.get(csvObjectKey))!;

    await store.put(
      csvObjectKey,
      original.replace("-64.12", "-64.13"),
      "text/csv",
    );
    expect(await commit(batchId)).toMatchObject({
      kind: "problem",
      message: expect.stringContaining("has changed"),
    });
    expect((await loadPreview(workspace, batchId, store))!.rows.ok).toBe(false);

    await store.delete(csvObjectKey);
    expect(await commit(batchId)).toMatchObject({
      kind: "problem",
      message: expect.stringContaining("is missing"),
    });
    expect(await listTransactions(workspace, { accountId })).toEqual([]);
  });

  it("refuses a batch from another workspace", async () => {
    const accountId = await newAccount();
    const batchId = await saved(accountId, "capital-one-normal.pdf");
    const other = await f.newWorkspace({ [userId]: "owner" });
    expect(
      await commitStatement({
        workspaceId: other,
        batchId,
        confirmIdentity: true,
        store,
      }),
    ).toMatchObject({
      kind: "problem",
    });
    expect(await loadPreview(other, batchId, store)).toBeNull();
  });
});

describe("discardPreview", () => {
  it("deletes the preview and its CSV, once", async () => {
    const accountId = await newAccount();
    const batchId = await saved(accountId, "capital-one-normal.pdf");

    expect(await discardPreview(workspace, batchId, store)).toBe(true);
    expect(await getBatch(workspace, batchId)).toBeNull();
    expect(await storedKeys(accountId)).toEqual([]);
    expect(await discardPreview(workspace, batchId, store)).toBe(false);
  });
});

describe("CSV exports", () => {
  it("previews a 360 export, stores its canonical CSV and imports it", async () => {
    const accountId = await newAccount();
    const batchId = await savedCsv(accountId, "capital-one-360-normal.csv");

    const batch = (await getBatch(workspace, batchId))!;
    expect(batch).toMatchObject({
      kind: "csv",
      statementInstitution: "Capital One",
      statementLast4: "1234",
      periodStart: "2026-09-02",
      periodEnd: "2026-09-30",
      openingBalanceCents: 100000,
      closingBalanceCents: 173410,
      rowsParsed: 5,
    });
    const view = (await loadPreview(workspace, batchId, store))!;
    expect(view.rows.ok).toBe(true);
    if (view.rows.ok) {
      expect(await store.get(batch.csvObjectKey)).toBe(toCsv(view.rows.rows));
      expect(view.rows.rows[0]!.description).toBe("PAYROLL ACME CO");
    }

    expect(await commit(batchId)).toEqual({
      kind: "committed",
      accountId,
      imported: 5,
      skipped: 0,
    });
    const rows = await listTransactions(workspace, { accountId });
    expect(rows.every((row) => row.source === "csv")).toBe(true);
    expect(await getAccount(workspace, accountId)).toMatchObject({
      balanceCents: 173410,
      balanceAsOf: "2026-09-30",
    });
  });

  it("imports a card export without balances and leaves the balance alone", async () => {
    const accountId = await newAccount({
      type: "credit_card",
      maskLast4: "5678",
    });
    const batchId = await savedCsv(accountId, "capital-one-card.csv");
    const [stored] = await db
      .select({ reconciliation: importBatch.reconciliation })
      .from(importBatch)
      .where(eq(importBatch.id, batchId));
    expect(stored!.reconciliation).toBe("not_applicable");
    const view = (await loadPreview(workspace, batchId, store))!;
    expect(view.summary).toMatchObject({
      openingBalanceCents: null,
      closingBalanceCents: null,
      moneyInCents: 25000,
      moneyOutCents: 6274,
    });
    expect(view.batch.checks.map((check) => check.id)).not.toContain(
      "reconciliation",
    );

    expect(await commit(batchId)).toMatchObject({ imported: 3 });
    expect(await getAccount(workspace, accountId)).toMatchObject({
      balanceCents: 100,
      balanceAsOf: "2026-09-15",
    });
  });

  it("refuses a card export's stored CSV that changed since the preview", async () => {
    const accountId = await newAccount({
      type: "credit_card",
      maskLast4: "5678",
    });
    const batchId = await savedCsv(accountId, "capital-one-card.csv");
    const { csvObjectKey } = (await getBatch(workspace, batchId))!;
    const original = (await store.get(csvObjectKey))!;
    await store.put(
      csvObjectKey,
      original.replace("-43.99", "-4.39"),
      "text/csv",
    );
    expect(await commit(batchId)).toMatchObject({
      kind: "problem",
      message: expect.stringContaining("has changed"),
    });
  });

  it("blocks the same export twice and skips rows another export already added", async () => {
    const accountId = await newAccount();
    await commit(await savedCsv(accountId, "capital-one-360-normal.csv"));

    const again = await previewCsv(accountId, "capital-one-360-normal.csv");
    expect(
      again.kind === "blocked" &&
        again.checks.find((check) => check.id === "duplicate-file")!.outcome,
    ).toBe("block");

    const overlap = await savedCsv(accountId, "capital-one-360-lf.csv");
    expect(await commit(overlap, false)).toEqual({
      kind: "committed",
      accountId,
      imported: 0,
      skipped: 5,
    });
  });

  it("stores nothing when a row's balance doesn't follow", async () => {
    const accountId = await newAccount();
    const outcome = await previewCsv(
      accountId,
      "capital-one-360-off-by-a-cent.csv",
    );
    expect(
      outcome.kind === "blocked" &&
        outcome.checks.find((check) => check.id === "running-balance")!.outcome,
    ).toBe("block");
    expect(await storedKeys(accountId)).toEqual([]);
  });

  it("blocks a 360 export for a credit card account", async () => {
    const outcome = await previewCsv(
      await newAccount({ type: "credit_card" }),
      "capital-one-360-normal.csv",
    );
    expect(
      outcome.kind === "blocked" &&
        outcome.checks.find((check) => check.id === "account-type")!.outcome,
    ).toBe("block");
  });

  it("reads only the chosen account from an export of two", async () => {
    const accountId = await newAccount();
    const batchId = await savedCsv(
      accountId,
      "capital-one-360-two-accounts.csv",
    );
    expect((await getBatch(workspace, batchId))!.rowsParsed).toBe(5);
  });

  it.each([
    [
      "capital-one-360-two-accounts.csv",
      "This CSV covers ••1234 and ••9876, but the chosen account ends in 9999.",
    ],
    [
      "other-bank.csv",
      "Only Capital One CSV exports can be read for now: 360 checking and savings, and credit cards.",
    ],
    [
      "empty.csv",
      "The CSV has no transactions. If this is a Capital One CSV export",
    ],
  ])("explains why %s can't be read", async (file, message) => {
    const outcome = await previewCsv(
      await newAccount({ maskLast4: "9999" }),
      file,
    );
    expect(outcome).toEqual({
      kind: "problem",
      message: expect.stringContaining(message),
    });
  });

  it("refuses a file that is neither a PDF nor a CSV", async () => {
    expect(
      await previewStatement({
        workspaceId: workspace,
        accountId: await newAccount(),
        userId,
        bytes: csvFile("capital-one-360-normal.csv"),
        fileName: "notes.txt",
        contentType: "text/plain",
        store,
      }),
    ).toEqual({
      kind: "problem",
      message: expect.stringContaining("isn't a PDF or a CSV file"),
    });
  });
});
