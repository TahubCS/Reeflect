import { and, eq } from "drizzle-orm";
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
import {
  createPlan,
  getPlan,
  listPlansBetween,
} from "@/features/plans/server/repository";
import { shiftDays } from "@/features/recurring/client";
import { savePayment } from "@/features/recurring/server/repository";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { recurringSeries, transaction } from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { summarize } from "../domain/cashflow";
import { fixtures, isNotFound } from "../../../../tests/support/db-fixtures";
import {
  addDayEntryAction,
  addPlanAction,
  confirmPlanAction,
  removeDayEntryAction,
  removePlanAction,
  setSubscriptionIntentAction,
} from "./actions";
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

  it("lets the built-in keywords choose when the category is left to us (ADR-103)", async () => {
    signedInAs(editor);
    const dining = (await listCategories(workspace)).find(
      (c) => c.presetKey === "dining",
    )!;

    await addDayEntryAction(
      workspace,
      lunch({ description: "Coffee and a bagel" }),
    );

    const [row] = (await transactionsIn(workspace)).filter(
      (r) => r.descriptionRaw === "Coffee and a bagel",
    );
    expect(row).toMatchObject({
      categoryId: dining.id,
      categoryIsManual: false,
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

describe("recurring payments on the calendar", () => {
  const nextMonth = () => {
    const [y, m] = today().split("-").map(Number) as [number, number];
    const next = m === 12 ? [y + 1, 1] : [y, m + 1];
    return `${next[0]}-${String(next[1]).padStart(2, "0")}-05`;
  };
  const save = (
    merchant: string,
    kind: "subscription" | "income" | "bill",
    amountCents: number,
    accountId = checking,
  ) =>
    savePayment(workspace, {
      accountId,
      merchant,
      name: merchant,
      kind,
      amountMode: "fixed",
      unit: "months",
      every: 1,
      amountCents,
      nextOn: nextMonth(),
      useHistory: false,
    });
  const intentOf = async (merchant: string) =>
    (
      await db
        .select({ userIntent: recurringSeries.userIntent })
        .from(recurringSeries)
        .where(
          and(
            eq(recurringSeries.workspaceId, workspace),
            eq(recurringSeries.merchant, merchant),
          ),
        )
    )[0]?.userIntent;

  beforeAll(async () => {
    expect(await save("stream service", "subscription", 1599)).toBe("ok");
    expect(await save("acme payroll", "income", 145000)).toBe("ok");
    expect(await save("music on card", "subscription", 999, card)).toBe("ok");
  });

  it("loads confirmed payments with F-10's estimates, signed, and a card's marked", async () => {
    signedInAs(viewer);

    const { data } = await loadDashboard(workspace);
    const byName = Object.fromEntries(data.recurring.map((r) => [r.name, r]));

    expect(byName["stream service"]).toMatchObject({
      kind: "subscription",
      amount: -1599,
      nextOn: nextMonth(),
      onCard: false,
      target: { accountId: checking, merchant: "stream service" },
    });
    expect(byName["acme payroll"]).toMatchObject({
      kind: "income",
      amount: 145000,
    });
    expect(byName["music on card"]).toMatchObject({ onCard: true });
    expect(summarize(data, today()).payday?.date).toBe(nextMonth());
  });

  it("saves planning to cancel and keep, the same choice the Recurring payments page shows", async () => {
    signedInAs(editor);
    const target = { accountId: checking, merchant: "stream service" };

    expect(
      await setSubscriptionIntentAction(workspace, {
        ...target,
        intent: "cancel",
      }),
    ).toEqual({ ok: true });
    expect(await intentOf("stream service")).toBe("cancel");
    expect(refresh).toHaveBeenCalledOnce();

    await setSubscriptionIntentAction(workspace, { ...target, intent: "keep" });
    expect(await intentOf("stream service")).toBe("keep");
  });

  it("refuses to mark pay, which is not a subscription", async () => {
    signedInAs(editor);

    expect(
      await setSubscriptionIntentAction(workspace, {
        accountId: checking,
        merchant: "acme payroll",
        intent: "cancel",
      }),
    ).toEqual({ ok: false, message: "Only subscriptions can be marked." });
    expect(await intentOf("acme payroll")).toBe("none");
  });

  it("finds nothing for a viewer, a stranger or a payment that is not saved", async () => {
    const target = { accountId: checking, merchant: "stream service" };
    signedInAs(viewer);
    expect(
      isNotFound(
        await thrown(
          setSubscriptionIntentAction(workspace, {
            ...target,
            intent: "cancel",
          }),
        ),
      ),
    ).toBe(true);
    signedInAs(stranger);
    expect(
      isNotFound(
        await thrown(
          setSubscriptionIntentAction(workspace, {
            ...target,
            intent: "cancel",
          }),
        ),
      ),
    ).toBe(true);
    signedInAs(editor);
    expect(
      isNotFound(
        await thrown(
          setSubscriptionIntentAction(workspace, {
            ...target,
            merchant: "nothing saved",
            intent: "cancel",
          }),
        ),
      ),
    ).toBe(true);
    expect(await intentOf("stream service")).toBe("keep");
  });
});

describe("plans on the calendar (F-37, ADR-102)", () => {
  const inDays = (days: number) => shiftDays(today(), days);
  const concert = (overrides: Record<string, unknown> = {}) => ({
    accountId: checking,
    plannedOn: inDays(5),
    direction: "out",
    amount: "45.00",
    description: "Concert tickets",
    categoryId: null,
    ...overrides,
  });
  const plansIn = (workspaceId: string) =>
    listPlansBetween(workspaceId, "2000-01-01", "2999-12-31");
  const planDirectly = async (plannedOn: string, categoryId: string | null) =>
    (await createPlan(workspace, {
      accountId: checking,
      plannedOn,
      amountCents: cents(-2500),
      description: "Dinner out",
      categoryId,
    }))!;

  it("adds a plan that shows on the calendar without touching the ledger", async () => {
    signedInAs(editor);
    const ledger = (await transactionsIn(workspace)).length;
    const before = await loadDashboard(workspace);
    const balanceBefore = summarize(before.data, before.today).balanceToday;

    const result = await addPlanAction(
      workspace,
      concert({ description: "Birthday dinner" }),
    );

    expect(result).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledOnce();
    expect(await transactionsIn(workspace)).toHaveLength(ledger);
    const dashboard = await loadDashboard(workspace);
    expect(dashboard.data.entries).toContainEqual(
      expect.objectContaining({
        name: "Birthday dinner",
        date: inDays(5),
        amount: -4500,
        isPlan: true,
      }),
    );
    // Today's balance is the same: the plan is only expected.
    expect(summarize(dashboard.data, dashboard.today).balanceToday).toBe(
      balanceBefore,
    );
  });

  it("refuses today and earlier days", async () => {
    signedInAs(editor);

    expect(
      await addPlanAction(workspace, concert({ plannedOn: today() })),
    ).toEqual({ ok: false, message: "Choose a day after today." });
  });

  it("refuses a day the calendar does not show", async () => {
    signedInAs(editor);

    expect(
      await addPlanAction(workspace, concert({ plannedOn: inDays(200) })),
    ).toEqual({ ok: false, message: "Choose a day the calendar shows." });
  });

  it("refuses another workspace's account or category and writes nothing", async () => {
    signedInAs(editor);
    const theirCategory = (await listCategories(otherWorkspace))[0]!;
    const before = (await plansIn(workspace)).length;

    expect(
      await addPlanAction(workspace, concert({ accountId: otherAccount })),
    ).toEqual({ ok: false, message: "Choose one of your accounts." });
    expect(
      await addPlanAction(workspace, concert({ categoryId: theirCategory.id })),
    ).toEqual({ ok: false, message: "Choose one of your categories." });
    expect(await plansIn(workspace)).toHaveLength(before);
    expect(await plansIn(otherWorkspace)).toHaveLength(0);
  });

  it("refuses malformed input", async () => {
    signedInAs(editor);

    expect(await addPlanAction(workspace, { amount: 12 })).toEqual({
      ok: false,
      message: "Check the form and try again.",
    });
  });

  it("removes a plan", async () => {
    signedInAs(editor);
    const id = await planDirectly(inDays(3), null);

    await removePlanAction(workspace, id);

    expect(await getPlan(workspace, id)).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("turns a plan whose day has come into a transaction, with its category", async () => {
    signedInAs(editor);
    const dining = (await listCategories(workspace)).find(
      (c) => c.presetKey === "dining",
    )!;
    const id = await planDirectly(today(), dining.id);

    expect(await confirmPlanAction(workspace, id)).toEqual({ ok: true });
    // A second click finds the plan gone and adds nothing.
    expect(isNotFound(await thrown(confirmPlanAction(workspace, id)))).toBe(
      true,
    );

    expect(await getPlan(workspace, id)).toBeNull();
    const rows = (await transactionsIn(workspace)).filter((r) => r.id === id);
    expect(rows).toEqual([
      expect.objectContaining({
        postedOn: today(),
        amountCents: -2500,
        descriptionRaw: "Dinner out",
        source: "manual",
        status: "posted",
        categoryId: dining.id,
        categoryIsManual: true,
      }),
    ]);
  });

  it("shows a plan left to us in its automatic category, and keeps it automatic once confirmed", async () => {
    signedInAs(editor);
    const transport = (await listCategories(workspace)).find(
      (c) => c.presetKey === "transport",
    )!;
    const id = (await createPlan(workspace, {
      accountId: checking,
      plannedOn: today(),
      amountCents: cents(-275),
      description: "Bus fare",
      categoryId: null,
    }))!;

    const dashboard = await loadDashboard(workspace);
    expect(dashboard.data.entries).toContainEqual(
      expect.objectContaining({ id, category: "Transport" }),
    );

    await confirmPlanAction(workspace, id);
    const [row] = (await transactionsIn(workspace)).filter((r) => r.id === id);
    expect(row).toMatchObject({
      categoryId: transport.id,
      categoryIsManual: false,
    });
  });

  it("refuses to confirm a plan before its day", async () => {
    signedInAs(editor);
    const id = await planDirectly(inDays(2), null);

    expect(await confirmPlanAction(workspace, id)).toEqual({
      ok: false,
      message: "You can confirm it on or after its day.",
    });
    expect(await getPlan(workspace, id)).not.toBeNull();
  });

  it("refuses a viewer and a stranger every plan action, and keeps the plan", async () => {
    const id = await planDirectly(today(), null);

    for (const who of [viewer, stranger]) {
      signedInAs(who);
      expect(
        isNotFound(await thrown(addPlanAction(workspace, concert()))),
      ).toBe(true);
      expect(isNotFound(await thrown(removePlanAction(workspace, id)))).toBe(
        true,
      );
      expect(isNotFound(await thrown(confirmPlanAction(workspace, id)))).toBe(
        true,
      );
    }
    expect(await getPlan(workspace, id)).not.toBeNull();
  });

  it("finds nothing for another workspace's plan or a bad id", async () => {
    signedInAs(stranger);
    const id = await planDirectly(today(), null);

    expect(isNotFound(await thrown(removePlanAction(otherWorkspace, id)))).toBe(
      true,
    );
    expect(
      isNotFound(await thrown(confirmPlanAction(otherWorkspace, id))),
    ).toBe(true);
    expect(
      isNotFound(await thrown(removePlanAction(otherWorkspace, "nope"))),
    ).toBe(true);
    expect(await getPlan(workspace, id)).not.toBeNull();
  });
});
