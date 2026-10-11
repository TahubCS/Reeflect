import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { uuidv7 } from "@/lib/db/id";
import {
  category,
  categoryRule,
  financialAccount,
  insightSample,
  member,
  organization,
  syntheticBatch,
  syntheticWorkspace,
  transaction,
  user,
} from "@/lib/db/schema";
import example from "../../tests/fixtures/synthetic/example-spec.json";
import { prepareBatch } from "./prepare";
import { NAME_PREFIX, buildRows, personRows } from "./rows";
import {
  connect,
  countBatchRows,
  countSampleFigures,
  deleteBatch,
  getBatch,
  insertBatch,
  listBatches,
  giveToUser,
  rollupBatch,
  takeBackFromUser,
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

afterAll(async () => {
  await close();
});

describe("batch store", () => {
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

  it("loads categories and rules with the batch, and deletes them with it (ADR-057)", async () => {
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

  it("writes each person's Insights figures at load, and rollup gives the same (ADR-056)", async () => {
    const { batchId, rows } = await load("store-insights");
    const figures = () =>
      db
        .select({
          workspaceId: insightSample.workspaceId,
          periodDays: insightSample.periodDays,
          measure: insightSample.measure,
          value: insightSample.value,
        })
        .from(insightSample)
        .where(eq(insightSample.batchId, batchId))
        .orderBy(
          insightSample.workspaceId,
          insightSample.periodDays,
          insightSample.measure,
        );
    const loaded = await figures();
    const people = new Set(loaded.map((f) => f.workspaceId));
    expect(people).toEqual(new Set(rows.organizations.map((o) => o.id)));
    expect(new Set(loaded.map((f) => f.periodDays))).toEqual(
      new Set([30, 90, 365]),
    );
    expect(
      loaded.filter((f) => f.measure === "take_home" && f.periodDays === 90),
    ).toHaveLength(people.size);
    expect(await countSampleFigures(db, batchId)).toBe(loaded.length);

    // A developer edits a sample workspace; rollup picks it up.
    const workspaceId = rows.organizations[0]!.id!;
    await db
      .delete(transaction)
      .where(eq(transaction.workspaceId, workspaceId));
    expect(await rollupBatch(db, batchId)).toBeLessThan(loaded.length);
    expect((await figures()).some((f) => f.workspaceId === workspaceId)).toBe(
      false,
    );

    await deleteBatch(db, batchId);
    expect(await figures()).toEqual([]);
  });

  it("rolls up to exactly what load wrote when nothing changed", async () => {
    const { batchId } = await load("store-rollup");
    const before = await db
      .select()
      .from(insightSample)
      .where(eq(insightSample.batchId, batchId));
    await rollupBatch(db, batchId);
    const after = await db
      .select()
      .from(insightSample)
      .where(eq(insightSample.batchId, batchId));
    const key = (f: (typeof before)[number]) =>
      `${f.workspaceId}|${f.periodDays}|${f.measure}|${f.value}`;
    expect(after.map(key).sort()).toEqual(before.map(key).sort());
    await deleteBatch(db, batchId);
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

describe("giving a developer a sample year (ADR-059)", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await db.delete(organization).where(
      inArray(
        organization.slug,
        userIds.map((id) => `personal-${id}`),
      ),
    );
    await db.delete(user).where(inArray(user.id, userIds));
  });

  /** A user with a Personal workspace, as ensurePersonalWorkspace makes it. */
  async function newUser(): Promise<{ userId: string; workspaceId: string }> {
    const userId = crypto.randomUUID();
    const workspaceId = uuidv7();
    userIds.push(userId);
    await db
      .insert(user)
      .values({ id: userId, name: "Dev", email: `${userId}@example.test` });
    await db.insert(organization).values({
      id: workspaceId,
      name: "Personal",
      slug: `personal-${userId}`,
      createdAt: new Date(),
    });
    await db.insert(member).values({
      id: uuidv7(),
      organizationId: workspaceId,
      userId,
      role: "owner",
      createdAt: new Date(),
    });
    return { userId, workspaceId };
  }

  const { expansion } = prepareBatch(structuredClone(example), {
    seed: "give-1",
    today: "2026-10-10",
  });
  const person = expansion.people[0]!;
  const give = (userId: string, replace = false) =>
    giveToUser(
      db,
      userId,
      (workspaceId, categoryIds) =>
        personRows(person, {
          workspaceId,
          categoryIds,
          asOf: expansion.asOf,
          newId: uuidv7,
          nicknamePrefix: NAME_PREFIX,
        }),
      { replace, newId: uuidv7 },
    );
  const sampleAccounts = (workspaceId: string) =>
    db
      .select({ id: financialAccount.id })
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.workspaceId, workspaceId),
          eq(financialAccount.source, "synthetic"),
        ),
      );

  it("writes the person into the Personal workspace without marking it synthetic", async () => {
    const { userId, workspaceId } = await newUser();
    // The user's renamed preset survives.
    await db.insert(category).values({
      id: uuidv7(),
      workspaceId,
      name: "My food",
      sortOrder: 0,
      presetKey: "groceries",
    });
    const result = await give(userId);
    expect(result).toMatchObject({
      workspaceId,
      accounts: person.accounts.length,
      transactions: person.transactions.length,
    });
    const rows = await db
      .select({ id: transaction.id })
      .from(transaction)
      .where(eq(transaction.workspaceId, workspaceId));
    expect(rows).toHaveLength(person.transactions.length);
    const groceries = await db
      .select({ name: category.name })
      .from(category)
      .where(
        and(
          eq(category.workspaceId, workspaceId),
          eq(category.presetKey, "groceries"),
        ),
      );
    expect(groceries).toEqual([{ name: "My food" }]);
    expect(
      await db
        .select()
        .from(syntheticWorkspace)
        .where(eq(syntheticWorkspace.workspaceId, workspaceId)),
    ).toEqual([]);
  });

  it("refuses a second give unless replacing, and replacing does not double up", async () => {
    const { userId, workspaceId } = await newUser();
    await give(userId);
    await expect(give(userId)).rejects.toThrow("--replace");
    const again = await give(userId, true);
    expect(again.replaced).toBe(person.accounts.length);
    expect(await sampleAccounts(workspaceId)).toHaveLength(
      person.accounts.length,
    );
    // Rules from the first give are kept, not added again.
    expect(again.rules).toBe(0);
  });

  it("take-back removes only the sample accounts and their transactions", async () => {
    const { userId, workspaceId } = await newUser();
    const own = uuidv7();
    await db.insert(financialAccount).values({
      id: own,
      workspaceId,
      institutionName: "My bank",
      nickname: "Mine",
      type: "checking",
      source: "manual",
      currentBalanceCents: 100,
    });
    await give(userId);
    expect((await takeBackFromUser(db, userId, { yes: false })).accounts).toBe(
      person.accounts.length,
    );
    expect(await sampleAccounts(workspaceId)).toHaveLength(
      person.accounts.length,
    );
    await takeBackFromUser(db, userId, { yes: true });
    expect(await sampleAccounts(workspaceId)).toEqual([]);
    const left = await db
      .select({ id: financialAccount.id })
      .from(financialAccount)
      .where(eq(financialAccount.workspaceId, workspaceId));
    expect(left).toEqual([{ id: own }]);
    expect(
      await db
        .select({ id: transaction.id })
        .from(transaction)
        .where(eq(transaction.workspaceId, workspaceId)),
    ).toEqual([]);
  });

  it("refuses a user without a Personal workspace", async () => {
    await expect(give(crypto.randomUUID())).rejects.toThrow(
      "no Personal workspace",
    );
  });
});
