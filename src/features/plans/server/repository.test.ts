import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "@/features/accounts/server/repository";
import {
  ensureCategories,
  listCategories,
} from "@/features/categorization/server/repository";
import { db } from "@/lib/db/client";
import { financialAccount, plannedTransaction } from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { fixtures } from "../../../../tests/support/db-fixtures";
import type { PlanInput } from "../domain/plan-input";
import {
  createPlan,
  deletePlan,
  getPlan,
  listPlansBetween,
} from "./repository";

// Integration tests: they need the PostgreSQL from `docker compose up -d`
// (or the CI service), migrated. See TEST-05.
const f = fixtures();
let workspaceA: string;
let workspaceB: string;
let checking: string;
let loan: string;
let otherAccount: string;

const account = (workspaceId: string, type: "checking" | "loan" = "checking") =>
  createAccount(workspaceId, {
    type,
    institutionName: "Bank",
    nickname: `My ${type}`,
    maskLast4: null,
    balanceCents: cents(100000),
  });

const plan = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  accountId: checking,
  plannedOn: "2026-10-20",
  amountCents: cents(-4500),
  description: "Concert tickets",
  categoryId: null,
  ...overrides,
});

beforeAll(async () => {
  workspaceA = await f.newWorkspace();
  workspaceB = await f.newWorkspace();
  checking = await account(workspaceA);
  loan = await account(workspaceA, "loan");
  otherAccount = await account(workspaceB);
});

afterAll(async () => {
  await f.cleanUp();
});

describe("plans repository", () => {
  it("adds a plan and reads it back with its category", async () => {
    await ensureCategories(workspaceA);
    const housing = (await listCategories(workspaceA)).find(
      (c) => c.presetKey === "housing",
    )!;
    const id = await createPlan(
      workspaceA,
      plan({ description: "Rent top-up", categoryId: housing.id }),
    );

    expect(await getPlan(workspaceA, id!)).toEqual({
      id,
      accountId: checking,
      plannedOn: "2026-10-20",
      amountCents: -4500,
      description: "Rent top-up",
      categoryId: housing.id,
      categoryName: housing.name,
      categoryPresetKey: "housing",
    });
  });

  it("gives a plan left to us the category the rules would choose (ADR-103)", async () => {
    await ensureCategories(workspaceA);
    const id = await createPlan(
      workspaceA,
      plan({ plannedOn: "2027-01-05", description: "Rent" }),
    );
    const unknown = await createPlan(
      workspaceA,
      plan({ plannedOn: "2027-01-06", description: "Thing for Alex" }),
    );

    const listed = await listPlansBetween(
      workspaceA,
      "2027-01-05",
      "2027-01-06",
    );
    expect(listed).toEqual([
      expect.objectContaining({
        id,
        categoryId: null,
        categoryName: "Housing",
        categoryPresetKey: "housing",
      }),
      expect.objectContaining({
        id: unknown,
        categoryId: null,
        categoryName: null,
      }),
    ]);
  });

  it("lists plans between two days, oldest first", async () => {
    const late = await createPlan(
      workspaceA,
      plan({ plannedOn: "2026-11-30" }),
    );
    const early = await createPlan(
      workspaceA,
      plan({ plannedOn: "2026-11-02" }),
    );
    await createPlan(workspaceA, plan({ plannedOn: "2026-12-01" }));

    const listed = await listPlansBetween(
      workspaceA,
      "2026-11-01",
      "2026-11-30",
    );
    expect(listed.map((p) => p.id)).toEqual([early, late]);
  });

  it("does not move the account's balance", async () => {
    await createPlan(workspaceA, plan({ amountCents: cents(-99999) }));
    const [row] = await db
      .select({ balance: financialAccount.currentBalanceCents })
      .from(financialAccount)
      .where(eq(financialAccount.id, checking));
    expect(row?.balance).toBe(100000);
  });

  it("refuses a loan account and another workspace's account", async () => {
    expect(await createPlan(workspaceA, plan({ accountId: loan }))).toBeNull();
    expect(
      await createPlan(workspaceA, plan({ accountId: otherAccount })),
    ).toBeNull();
  });

  it("never shows or deletes another workspace's plans", async () => {
    const id = await createPlan(workspaceA, plan({ plannedOn: "2026-10-25" }));

    expect(await getPlan(workspaceB, id!)).toBeNull();
    expect(
      await listPlansBetween(workspaceB, "2026-10-01", "2026-12-31"),
    ).toEqual([]);
    expect(await deletePlan(workspaceB, id!)).toBe(false);
    expect(await getPlan(workspaceA, id!)).not.toBeNull();
  });

  it("deletes a plan once", async () => {
    const id = await createPlan(workspaceA, plan());

    expect(await deletePlan(workspaceA, id!)).toBe(true);
    expect(await deletePlan(workspaceA, id!)).toBe(false);
    expect(await getPlan(workspaceA, id!)).toBeNull();
  });

  it("goes with its account when the account is deleted", async () => {
    const doomed = await account(workspaceA);
    const id = await createPlan(workspaceA, plan({ accountId: doomed }));
    await db.delete(financialAccount).where(eq(financialAccount.id, doomed));

    const left = await db
      .select()
      .from(plannedTransaction)
      .where(eq(plannedTransaction.id, id!));
    expect(left).toEqual([]);
  });
});
