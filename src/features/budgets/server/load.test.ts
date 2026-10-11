import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as categorization from "@/features/categorization";
import { fixtures, isNotFound } from "../../../../tests/support/db-fixtures";
import { loadBudgets } from "./load";
import * as repository from "./repository";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));
const f = fixtures();
const NOW = new Date("2026-10-11T16:00:00Z");
let editor: string, viewer: string, stranger: string;
beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  stranger = await f.newUser();
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => f.cleanUp());
async function thrown(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("Expected control-flow exception");
}
describe("authorized budget page reads", () => {
  it("defaults to the current workspace-local month and initializes categories only for editors", async () => {
    const ws = await f.newWorkspace({ [editor]: "editor" });
    getSession.mockResolvedValue({ user: { id: editor } });
    const data = await loadBudgets(
      ws,
      undefined,
      new Date("2026-11-01T03:30:00Z"),
    );
    expect(data).toMatchObject({
      workspaceId: ws,
      month: "2026-10",
      today: "2026-10-31",
      canEdit: true,
      isEditor: true,
    });
    expect(data.rows).toHaveLength(15);
    expect(data.excludedCategories).toHaveLength(3);
    expect(await categorization.listCategories(ws)).toHaveLength(18);
    expect((await loadBudgets(ws, "2026-11", NOW)).canEdit).toBe(true);
    expect((await loadBudgets(ws, "2025-01", NOW)).canEdit).toBe(false);
  });
  it("does not seed or expose editing to viewers", async () => {
    const ws = await f.newWorkspace({ [viewer]: "viewer" });
    getSession.mockResolvedValue({ user: { id: viewer } });
    expect(await loadBudgets(ws, undefined, NOW)).toMatchObject({
      canEdit: false,
      isEditor: false,
      rows: [],
    });
    expect(await categorization.listCategories(ws)).toEqual([]);
    const current = await loadBudgets(ws);
    expect(current.canEdit).toBe(false);
    expect(current.month).toBe(current.today.slice(0, 7));
  });
  it.each([null, "stranger"])(
    "rejects %j before category initialization or ledger reads",
    async (kind) => {
      const ws = await f.newWorkspace({ [editor]: "editor" });
      getSession.mockResolvedValue(
        kind === null ? null : { user: { id: stranger } },
      );
      const seed = vi.spyOn(categorization, "ensureCategories");
      const read = vi.spyOn(repository, "readBudgetMonth");
      expect(isNotFound(await thrown(loadBudgets(ws, undefined, NOW)))).toBe(
        true,
      );
      expect(seed).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each(["bad-month", ["2026-10", "2026-09"], "2026-12", "1999-12"])(
    "rejects invalid month %j before reading financial data",
    async (month) => {
      const ws = await f.newWorkspace({ [editor]: "editor" });
      getSession.mockResolvedValue({ user: { id: editor } });
      const read = vi.spyOn(repository, "readBudgetMonth");
      expect(isNotFound(await thrown(loadBudgets(ws, month, NOW)))).toBe(true);
      expect(read).not.toHaveBeenCalled();
      expect(await categorization.listCategories(ws)).toEqual([]);
    },
  );
  it("propagates a database failure to the route's retry boundary, without fabricated zero totals", async () => {
    const ws = await f.newWorkspace({ [viewer]: "viewer" });
    getSession.mockResolvedValue({ user: { id: viewer } });
    vi.spyOn(repository, "readBudgetMonth").mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    await expect(loadBudgets(ws, undefined, NOW)).rejects.toThrow(
      "database unavailable",
    );
  });
});
