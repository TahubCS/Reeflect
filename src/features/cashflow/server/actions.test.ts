import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { createAccount } from "@/features/accounts/server/repository";
import {
  ensureCategories,
  listCategories,
} from "@/features/categorization/server/repository";
import {
  createTransaction,
  getTransaction,
} from "@/features/transactions/server/repository";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { transaction } from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { summarize } from "../domain/cashflow";
import { fixtures, isNotFound } from "../../../../tests/support/db-fixtures";
import { addDayEntryAction, removeDayEntryAction } from "./actions";
import { loadDashboard } from "./load";

// Integration tests against the Docker database (TEST-05); the session and
// Next's in-place refresh are faked.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ refresh }));

const f = fixtures();
let editor: string;
let viewer: string;
let stranger: string;
let workspace: string;
let otherWorkspace: string;
let checking: string;
let card: string;
let otherAccount: string;

const signedInAs = (id: string) =>
  getSession.mockResolvedValue({ user: { id } });
const today = () => isoDateIn(new Date(), DEFAULT_TIME_ZONE);

async function thrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}

const transactionsIn = (workspaceId: string) =>
  db.select().from(transaction).where(eq(transaction.workspaceId, workspaceId));

const lunch = (overrides: Record<string, unknown> = {}) => ({
  accountId: checking,
  postedOn: today(),
  direction: "out",
  amount: "12.50",
  description: "Lunch",
  categoryId: null,
  ...overrides,
});

beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  stranger = await f.newUser();
  workspace = await f.newWorkspace({ [editor]: "owner", [viewer]: "viewer" });
  otherWorkspace = await f.newWorkspace({ [stranger]: "owner" });
  checking = await createAccount(workspace, {
    type: "checking",
    institutionName: "Bank",
    nickname: "Everyday",
    maskLast4: null,
    balanceCents: cents(100000),
  });
  card = await createAccount(workspace, {
    type: "credit_card",
    institutionName: "Bank",
    nickname: "Quicksilver",
    maskLast4: null,
    balanceCents: cents(-20000),
  });
  otherAccount = await createAccount(otherWorkspace, {
    type: "checking",
    institutionName: "Bank",
    nickname: "Theirs",
    maskLast4: null,
    balanceCents: cents(5000),
  });
  await ensureCategories(workspace);
  await ensureCategories(otherWorkspace);
});

beforeEach(() => {
  refresh.mockClear();
});

afterAll(async () => {
  await f.cleanUp();
});

describe("loadDashboard", () => {
  it("gives a viewer the month without the day panel's form", async () => {
    signedInAs(viewer);

    const dashboard = await loadDashboard(workspace);

    expect(dashboard).toMatchObject({
      workspaceId: workspace,
      today: today(),
      canEdit: false,
      linkState: { status: "none" },
    });
    expect(dashboard.accounts).toEqual([
      { id: checking, nickname: "Everyday", type: "checking" },
      { id: card, nickname: "Quicksilver", type: "credit_card" },
    ]);
    expect(dashboard.categories.map((c) => c.name)).not.toContain("Income");
    expect(dashboard.categories.length).toBeGreaterThan(0);
  });

  it("lets an editor add, and counts only checking and savings in the balance", async () => {
    signedInAs(editor);

    const dashboard = await loadDashboard(workspace);

    expect(dashboard.canEdit).toBe(true);
    expect(dashboard.data.recurring).toEqual([]);
    // The card's −$200 is owed, not taken from today's balance (ADR-024).
    expect(summarize(dashboard.data, dashboard.today).balanceToday).toBe(
      100000,
    );
  });

  it("finds nothing for someone outside the workspace", async () => {
    signedInAs(stranger);

    expect(isNotFound(await thrown(loadDashboard(workspace)))).toBe(true);
  });
});

describe("addDayEntryAction", () => {
  it("adds a typed transaction with the chosen category and refreshes in place", async () => {
    signedInAs(editor);
    const groceries = (await listCategories(workspace)).find(
      (c) => c.presetKey === "groceries",
    )!;

    const result = await addDayEntryAction(
      workspace,
      lunch({ description: "Corner Market", categoryId: groceries.id }),
    );

    expect(result).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledOnce();
    const [row] = (await transactionsIn(workspace)).filter(
      (r) => r.descriptionRaw === "Corner Market",
    );
    expect(row).toMatchObject({
      financialAccountId: checking,
      amountCents: -1250,
      source: "manual",
      categoryId: groceries.id,
      categoryIsManual: true,
    });
  });

  it("explains a bad amount and writes nothing", async () => {
    signedInAs(editor);
    const before = (await transactionsIn(workspace)).length;

    const result = await addDayEntryAction(
      workspace,
      lunch({ amount: "lots" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Enter an amount above zero, like 12.50.",
    });
    expect(await transactionsIn(workspace)).toHaveLength(before);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses a day after today", async () => {
    signedInAs(editor);

    const result = await addDayEntryAction(
      workspace,
      lunch({ postedOn: "2999-01-01" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Enter today or an earlier date.",
    });
  });

  it("refuses another workspace's account or category and writes nothing", async () => {
    signedInAs(editor);
    const theirCategory = (await listCategories(otherWorkspace))[0]!;
    const before = (await transactionsIn(workspace)).length;

    expect(
      await addDayEntryAction(workspace, lunch({ accountId: otherAccount })),
    ).toEqual({ ok: false, message: "Choose one of your accounts." });
    expect(
      await addDayEntryAction(
        workspace,
        lunch({ categoryId: theirCategory.id }),
      ),
    ).toEqual({ ok: false, message: "Choose one of your categories." });
    expect(await transactionsIn(workspace)).toHaveLength(before);
    expect(await transactionsIn(otherWorkspace)).toHaveLength(0);
  });

  it("refuses malformed input", async () => {
    signedInAs(editor);

    expect(await addDayEntryAction(workspace, { amount: 12 })).toEqual({
      ok: false,
      message: "Check the form and try again.",
    });
  });

  it("refuses a viewer", async () => {
    signedInAs(viewer);

    expect(
      isNotFound(await thrown(addDayEntryAction(workspace, lunch()))),
    ).toBe(true);
  });
});

describe("removeDayEntryAction", () => {
  const typed = async () =>
    (await createTransaction(workspace, {
      description: "Typo",
      isTransfer: false,
      ledger: {
        accountId: checking,
        postedOn: "2026-01-10",
        amountCents: cents(-300),
        status: "posted",
      },
    }))!;

  it("removes a typed transaction and refreshes in place", async () => {
    signedInAs(editor);
    const id = await typed();

    await removeDayEntryAction(workspace, id);

    expect(await getTransaction(workspace, id)).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("leaves an imported row to the Transactions page", async () => {
    signedInAs(editor);
    const id = uuidv7();
    await db.insert(transaction).values({
      id,
      workspaceId: workspace,
      financialAccountId: checking,
      postedOn: "2026-01-11",
      amountCents: -400,
      descriptionRaw: "Imported",
      source: "csv",
      fingerprint: `test:${id}`,
    });

    expect(isNotFound(await thrown(removeDayEntryAction(workspace, id)))).toBe(
      true,
    );
    expect(await getTransaction(workspace, id)).not.toBeNull();
  });

  it("refuses a viewer and keeps the row", async () => {
    const id = await typed();
    signedInAs(viewer);

    expect(isNotFound(await thrown(removeDayEntryAction(workspace, id)))).toBe(
      true,
    );
    expect(await getTransaction(workspace, id)).not.toBeNull();
  });
});
