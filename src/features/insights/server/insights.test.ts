import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAccount } from "@/features/accounts/server/repository";
import { ensureCategories } from "@/features/categorization/server/repository";
import { createTransaction } from "@/features/transactions/server/repository";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { category, transaction } from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { and, eq } from "drizzle-orm";
import { prepareBatch } from "../../../../scripts/batch/prepare";
import { buildRows } from "../../../../scripts/batch/rows";
import {
  connect,
  deleteBatch,
  insertBatch,
} from "../../../../scripts/batch/store";
import example from "../../../../tests/fixtures/synthetic/example-spec.json";
import { fixtures, isNotFound } from "../../../../tests/support/db-fixtures";
import { getInsights } from "./insights";

// Integration tests against the Docker database (TEST-05); only the session
// is faked. The sample batch is loaded the way `pnpm batch load` does it.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

const f = fixtures();
const batchDb = connect(process.env.DATABASE_URL!);
const batchId = uuidv7();
// Your period ends the day before: 2026-10-10, the batch's as-of.
const NOW = new Date("2026-10-11T12:00:00Z");
let member: string;
let workspace: string;
let empty: string;
let label: string;

beforeAll(async () => {
  const prepared = prepareBatch(structuredClone(example), {
    seed: "insights-server",
    today: "2026-10-10",
  });
  label = prepared.batch.label;
  await insertBatch(
    batchDb.db,
    { id: batchId, ...prepared.batch },
    buildRows(prepared.expansion, { batchId, now: new Date(), newId: uuidv7 }),
  );

  member = await f.newUser();
  workspace = await f.newWorkspace({ [member]: "viewer" });
  empty = await f.newWorkspace({ [member]: "viewer" });
  await ensureCategories(workspace);
  const [dining] = await db
    .update(category)
    .set({ name: "Eating out" })
    .where(
      and(
        eq(category.workspaceId, workspace),
        eq(category.presetKey, "dining"),
      ),
    )
    .returning({ id: category.id });
  const accountId = await createAccount(workspace, {
    type: "checking",
    institutionName: "Bank",
    nickname: "Checking",
    maskLast4: null,
    balanceCents: null,
  });
  const add = (postedOn: string, amount: number, description: string) =>
    createTransaction(workspace, {
      description,
      isTransfer: false,
      ledger: {
        accountId,
        postedOn,
        amountCents: cents(amount),
        status: "posted",
      },
    });
  await add("2026-06-01", -500, "Old coffee");
  await add("2026-09-15", 400_000, "Payroll");
  const bistro = await add("2026-09-20", -12_000, "Bistro");
  await add("2026-09-21", -3_000, "Somewhere");
  // A manual choice, as the Transactions page saves it.
  await db
    .update(transaction)
    .set({ categoryId: dining!.id, categoryIsManual: true })
    .where(eq(transaction.id, bistro!));
});

afterAll(async () => {
  await deleteBatch(batchDb.db, batchId);
  await batchDb.close();
  await f.cleanUp();
});

describe("getInsights", () => {
  it("compares your workspace with the newest sample batch", async () => {
    getSession.mockResolvedValue({ user: { id: member } });
    const view = await getInsights(workspace, { period: "nonsense" }, NOW);

    expect(view.query).toEqual({
      period: 90,
      compare: "like_you",
      show: "dollars",
    });
    expect(view.period).toEqual({
      days: 90,
      from: "2026-07-13",
      to: "2026-10-10",
    });
    expect(view.you!.coveredDays).toBe(90);
    expect(view.you!.measures.take_home).toBe(
      Math.round((400_000 * 30.4375) / 90),
    );
    expect(view.you!.uncategorized).toBe(Math.round((3_000 * 30.4375) / 90));

    const sample = view.sample!;
    // The example batch has three people: fewer than 20, so all of them.
    expect(sample.label).toBe(label);
    expect(sample.group.size).toBe(3);
    expect(sample.everyoneInstead).toBe(false);
    expect(sample.categories.find((r) => r.key === "dining")?.label).toBe(
      "Eating out",
    );
    expect(sample.comparisons.map((c) => c.metric.id)).toContain("spending");
  });

  it("compares with everyone when you have no take-home yet", async () => {
    getSession.mockResolvedValue({ user: { id: member } });
    const view = await getInsights(empty, { compare: "like_you" }, NOW);
    expect(view.you).toBeNull();
    expect(view.sample!.everyoneInstead).toBe(true);
    expect(view.sample!.comparisons).toEqual([]);
  });

  it("finds nothing for someone who isn't a member", async () => {
    getSession.mockResolvedValue({ user: { id: await f.newUser() } });
    await expect(getInsights(workspace, {}, NOW)).rejects.toSatisfy(isNotFound);
  });
});
