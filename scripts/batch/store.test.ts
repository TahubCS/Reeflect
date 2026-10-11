import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { uuidv7 } from "@/lib/db/id";
import {
  category,
  categoryRule,
  financialAccount,
  organization,
  syntheticBatch,
  syntheticWorkspace,
  transaction,
} from "@/lib/db/schema";
import example from "../../tests/fixtures/synthetic/example-spec.json";
import { prepareBatch } from "./prepare";
import { buildRows } from "./rows";
import {
  connect,
  countBatchRows,
  deleteBatch,
  getBatch,
  insertBatch,
  listBatches,
} from "./store";

// Integration tests: they need the PostgreSQL from `docker compose up -d`
// (or the CI service), migrated. See TEST-05.
const { db, close } = connect(process.env.DATABASE_URL!);

async function load(seed: string) {
  const prepared = prepareBatch(structuredClone(example), {
    seed,
    today: "2026-10-10",
  });
  const batchId = uuidv7();
  const rows = buildRows(prepared.expansion, {
    batchId,
    now: new Date(),
    newId: uuidv7,
  });
  await insertBatch(db, { id: batchId, ...prepared.batch }, rows);
  return { batchId, rows };
}

describe("batch store", () => {
  afterAll(async () => {
    await close();
  });

  it("loads a batch and counts exactly the rows it built", async () => {
    const { batchId, rows } = await load("store-1");
    expect(await countBatchRows(db, batchId)).toEqual({
      workspaces: rows.organizations.length,
      accounts: rows.accounts.length,
      transactions: rows.transactions.length,
    });
    expect((await getBatch(db, batchId))?.seed).toBe("store-1");
    const listed = (await listBatches(db)).find((b) => b.id === batchId);
    expect(listed).toMatchObject({ workspaces: 3, months: 3 });
    await deleteBatch(db, batchId);
  });

  it("loads categories and rules with the batch, and deletes them with it (ADR-056)", async () => {
    const { batchId, rows } = await load("store-categories");
    const workspaces = rows.organizations.map((o) => o.id!);
    const categories = () =>
      db
        .select({ id: category.id })
        .from(category)
        .where(inArray(category.workspaceId, workspaces));
    const rules = () =>
      db
        .select({ id: categoryRule.id })
        .from(categoryRule)
        .where(inArray(categoryRule.workspaceId, workspaces));
    expect(await categories()).toHaveLength(rows.categories.length);
    expect(await rules()).toHaveLength(rows.rules.length);
    const categorized = await db
      .select({ id: transaction.id })
      .from(transaction)
      .where(
        and(
          inArray(transaction.workspaceId, workspaces),
          isNotNull(transaction.categoryId),
        ),
      );
    expect(categorized).toHaveLength(
      rows.transactions.filter((t) => t.categoryId).length,
    );
    await deleteBatch(db, batchId);
    expect(await categories()).toEqual([]);
    expect(await rules()).toEqual([]);
  });

  it("writes nothing when any row fails", async () => {
    const prepared = prepareBatch(structuredClone(example), {
      seed: "store-2",
      today: "2026-10-10",
    });
    const batchId = uuidv7();
    const rows = buildRows(prepared.expansion, {
      batchId,
      now: new Date(),
      newId: uuidv7,
    });
    // Two transactions with one fingerprint on one account break the unique index.
    rows.transactions.push({ ...rows.transactions[0]!, id: uuidv7() });
    await expect(
      insertBatch(db, { id: batchId, ...prepared.batch }, rows),
    ).rejects.toThrow();
    expect(await getBatch(db, batchId)).toBeUndefined();
    const orgs = await db
      .select()
      .from(organization)
      .where(
        inArray(
          organization.id,
          rows.organizations.map((o) => o.id!),
        ),
      );
    expect(orgs).toEqual([]);
  });

  it("deletes a batch with all its workspaces, accounts and transactions", async () => {
    const { batchId, rows } = await load("store-3");
    const keep = await load("store-4");

    expect(await deleteBatch(db, batchId)).toBe(3);

    const workspaceIds = rows.organizations.map((o) => o.id!);
    for (const [table, column] of [
      [organization, organization.id],
      [financialAccount, financialAccount.workspaceId],
      [transaction, transaction.workspaceId],
      [syntheticWorkspace, syntheticWorkspace.workspaceId],
    ] as const) {
      expect(
        await db.select().from(table).where(inArray(column, workspaceIds)),
      ).toEqual([]);
    }
    expect(await getBatch(db, batchId)).toBeUndefined();
    // Another batch is untouched.
    expect((await countBatchRows(db, keep.batchId)).workspaces).toBe(3);
    await deleteBatch(db, keep.batchId);
  });

  it("refuses to delete a batch row while its workspaces exist", async () => {
    const { batchId } = await load("store-5");
    await expect(
      db.delete(syntheticBatch).where(eq(syntheticBatch.id, batchId)),
    ).rejects.toThrow();
    await deleteBatch(db, batchId);
  });

  it("deleting an unknown batch removes nothing", async () => {
    expect(await deleteBatch(db, uuidv7())).toBe(0);
  });
});
