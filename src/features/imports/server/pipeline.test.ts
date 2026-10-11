import { readFileSync } from "node:fs";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAccount,
  getAccount,
} from "@/features/accounts/server/repository";
import { listTransactions } from "@/features/transactions/server/repository";
import { db } from "@/lib/db/client";
import { transaction } from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { statementStore } from "@/lib/storage";
import { accountPrefix } from "@/lib/storage/keys";
import { fixtures } from "../../../../tests/support/db-fixtures";
import { toCsv } from "../domain/csv";
import {
  commitStatement,
  discardPreview,
  loadPreview,
  previewStatement,
} from "./pipeline";
import { getBatch, listPreviews } from "./repository";

// Integration tests against the Docker database and S3Mock (TEST-05).

const f = fixtures();
const store = statementStore()!;
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
    type?: "checking" | "savings";
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

const commit = (batchId: string, confirmIdentity = true) =>
  commitStatement({ workspaceId: workspace, batchId, confirmIdentity, store });

async function storedKeys(accountId: string): Promise<string[]> {
  const client = new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: process.env.AWS_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  const page = await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.STATEMENTS_BUCKET,
      Prefix: accountPrefix(workspace, accountId),
    }),
  );
  return (page.Contents ?? []).map((item) => item.Key!);
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
