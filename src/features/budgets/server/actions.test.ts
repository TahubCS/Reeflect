import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ensureCategories, listCategories } from "@/features/categorization";
import { db } from "@/lib/db/client";
import { budget } from "@/lib/db/schema";
import { fixtures, isNotFound } from "../../../../tests/support/db-fixtures";
import * as months from "../domain/months";
import {
  copyBudgetsAction,
  removeBudgetAction,
  saveBudgetAction,
} from "./actions";
import * as repository from "./repository";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("next/cache", async (original) => ({
  ...(await original<typeof import("next/cache")>()),
  refresh: vi.fn(),
}));
const f = fixtures();
const EMPTY = { errors: {} };
const MONTH = "2026-10";
let editor: string,
  viewer: string,
  stranger: string,
  workspace: string,
  other: string;
let categoryId: string, foreignCategory: string, income: string;
const form = (amount = "500.00") => {
  const data = new FormData();
  data.set("amount", amount);
  return data;
};
async function thrown(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("Expected control-flow exception");
}
const rows = () =>
  db
    .select()
    .from(budget)
    .where(eq(budget.workspaceId, workspace))
    .orderBy(budget.id);
const save = (
  month: unknown = MONTH,
  id: unknown = categoryId,
  data = form(),
) => saveBudgetAction(workspace, month, id, EMPTY, data);
const remove = (month: unknown = MONTH, id: unknown = categoryId) =>
  removeBudgetAction(workspace, month, id, EMPTY, new FormData());
const copy = (month: unknown = MONTH) =>
  copyBudgetsAction(workspace, month, EMPTY, new FormData());

beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  stranger = await f.newUser();
  workspace = await f.newWorkspace({ [editor]: "editor", [viewer]: "viewer" });
  other = await f.newWorkspace();
  await ensureCategories(workspace);
  await ensureCategories(other);
  const categories = await listCategories(workspace);
  categoryId = categories.find((c) => c.presetKey === "groceries")!.id;
  income = categories.find((c) => c.presetKey === "income")!.id;
  foreignCategory = (await listCategories(other))[0]!.id;
});
beforeEach(async () => {
  getSession.mockResolvedValue({ user: { id: editor } });
  vi.spyOn(months, "todayInZone").mockReturnValue("2026-10-11");
  vi.mocked(refresh).mockClear();
  await db.delete(budget).where(eq(budget.workspaceId, workspace));
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => f.cleanUp());

describe("authorized budget actions", () => {
  it("saves, edits, removes and re-adds zero, ignoring forged form targets", async () => {
    const data = form();
    data.set("workspaceId", other);
    data.set("categoryId", foreignCategory);
    data.set("month", "2025-01");
    expect(await save(MONTH, categoryId, data)).toEqual({
      errors: {},
      message: "Budget saved.",
    });
    expect((await rows())[0]).toMatchObject({
      workspaceId: workspace,
      categoryId,
      month: MONTH,
      amountCents: 50000,
    });
    await save(MONTH, categoryId, form("550"));
    expect((await rows())[0]!.amountCents).toBe(55000);
    expect(await remove()).toMatchObject({
      message: "Budget removed. Spending is still recorded.",
    });
    expect(await rows()).toEqual([]);
    await save(MONTH, categoryId, form("0"));
    expect((await rows())[0]!.amountCents).toBe(0);
    expect(vi.mocked(refresh)).toHaveBeenCalledTimes(4);
    expect(
      await db.select().from(budget).where(eq(budget.workspaceId, other)),
    ).toEqual([]);
  });
  it("copies only missing allocations and reports singular, plural and repeated copy", async () => {
    const categories = (await listCategories(workspace)).filter(
      (c) => !["income", "retirement", "investing"].includes(c.presetKey),
    );
    await db.insert(budget).values(
      categories.slice(0, 2).map((c) => ({
        workspaceId: workspace,
        categoryId: c.id,
        month: "2026-09",
        amountCents: 1234,
      })),
    );
    expect((await copy()).message).toBe(
      "Copied 2 budgets. Existing allocations were kept.",
    );
    await db
      .delete(budget)
      .where(
        and(
          eq(budget.workspaceId, workspace),
          eq(budget.month, MONTH),
          eq(budget.categoryId, categories[0]!.id),
        ),
      );
    expect((await copy()).message).toBe(
      "Copied 1 budget. Existing allocations were kept.",
    );
    expect((await copy()).message).toContain("No allocations to copy");
    expect((await copy("2026-11")).message).toContain("Copied 2 budgets");
  });
  it.each(["", "-1", "nonsense", "100000000.01", "1.234"])(
    "retains invalid amount %j without writing or refreshing",
    async (amount) => {
      const state = await save(MONTH, categoryId, form(amount));
      expect(state.errors.amount).toBeDefined();
      expect(state.amount).toBe(amount);
      expect(await rows()).toEqual([]);
      expect(refresh).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "2026-13", "2026-1", [MONTH]])(
    "rejects malformed month %j before a write",
    async (month) => {
      const spy = vi.spyOn(repository, "saveBudget");
      expect(
        isNotFound(
          await thrown(
            saveBudgetAction(workspace, month, categoryId, EMPTY, form()),
          ),
        ),
      ).toBe(true);
      expect(
        isNotFound(
          await thrown(
            removeBudgetAction(workspace, month, categoryId, EMPTY, form()),
          ),
        ),
      ).toBe(true);
      expect(
        isNotFound(
          await thrown(copyBudgetsAction(workspace, month, EMPTY, form())),
        ),
      ).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    },
  );
  it.each(["2026-09", "2025-01", "2026-12"])(
    "rejects non-editable month %s without writes",
    async (month) => {
      expect((await save(month)).errors.form).toContain("read-only");
      expect((await remove(month)).errors.form).toContain("read-only");
      expect((await copy(month)).errors.form).toContain("read-only");
      expect(await rows()).toEqual([]);
      expect(refresh).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "bad-id", crypto.randomUUID()])(
    "rejects malformed or absent category %j",
    async (id) => {
      expect(
        isNotFound(
          await thrown(saveBudgetAction(workspace, MONTH, id, EMPTY, form())),
        ),
      ).toBe(true);
      expect(
        isNotFound(
          await thrown(removeBudgetAction(workspace, MONTH, id, EMPTY, form())),
        ),
      ).toBe(true);
    },
  );
  it("rejects foreign and non-spending categories", async () => {
    expect(isNotFound(await thrown(save(MONTH, foreignCategory)))).toBe(true);
    expect(isNotFound(await thrown(remove(MONTH, foreignCategory)))).toBe(true);
    expect((await save(MONTH, income)).errors.form).toContain(
      "Income and saving",
    );
    expect((await remove(MONTH, income)).errors.form).toContain(
      "Income and saving",
    );
    expect(await rows()).toEqual([]);
  });
  it.each(["viewer", "stranger", "signed out"])(
    "authorizes %s before parsing any action input",
    async (kind) => {
      getSession.mockResolvedValue(
        kind === "signed out"
          ? null
          : { user: { id: kind === "viewer" ? viewer : stranger } },
      );
      const spy = vi.spyOn(repository, "saveBudget");
      for (const call of [
        () => save(undefined, "malformed"),
        () => remove(undefined, "malformed"),
        () => copy(undefined),
      ])
        expect(isNotFound(await thrown(call()))).toBe(true);
      expect(spy).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(await rows()).toEqual([]);
    },
  );
  it.each(["save", "remove", "copy"])(
    "handles %s database errors without leaking financial details",
    async (operation) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const secret = new Error("private merchant and credential");
      let state;
      if (operation === "save") {
        vi.spyOn(repository, "saveBudget").mockRejectedValueOnce(secret);
        state = await save(MONTH, categoryId, form("123.45"));
      } else if (operation === "remove") {
        vi.spyOn(repository, "removeBudget").mockRejectedValueOnce(secret);
        state = await remove();
      } else {
        vi.spyOn(repository, "copyPreviousBudgets").mockRejectedValueOnce(
          secret,
        );
        state = await copy();
      }
      expect(state.errors.form).toBe(
        "Could not save this change. Please try again.",
      );
      expect(JSON.stringify(state)).not.toContain("private");
      if (operation === "save") expect(state.amount).toBe("123.45");
      expect(log).toHaveBeenCalledWith("budgets: write failed", {
        workspaceId: workspace,
      });
      expect(refresh).not.toHaveBeenCalled();
    },
  );
  it("keeps repository control-flow results outside the error catch", async () => {
    vi.spyOn(repository, "saveBudget").mockResolvedValueOnce("not_found");
    expect(isNotFound(await thrown(save()))).toBe(true);
    vi.spyOn(repository, "removeBudget").mockResolvedValueOnce("read_only");
    expect((await remove()).errors.form).toContain("read-only");
    vi.spyOn(repository, "copyPreviousBudgets").mockResolvedValueOnce({
      result: "not_found",
      copied: 0,
    });
    expect(isNotFound(await thrown(copy()))).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });
});
