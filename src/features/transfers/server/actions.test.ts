import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fixtures, isNotFound } from "../../../../tests/support/db-fixtures";
import type { ReviewRow, WriteResult } from "../domain/review";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  readReview: vi.fn(),
  writeReview: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("./repository", () => ({
  readReview: mocks.readReview,
  writeReview: mocks.writeReview,
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
import { loadTransferReview } from "./load";
import { reviewTransferAction } from "./actions";
const f = fixtures();
let ws: string, editor: string, viewer: string, outsider: string;
const row: ReviewRow = {
  id: crypto.randomUUID(),
  workspaceId: "unused",
  accountId: crypto.randomUUID(),
  postedOn: "2026-10-11",
  amountCents: -20000,
  description: "Repayment",
  status: "posted",
  isTransfer: false,
  pairId: null,
  updatedAt: "2026-10-11T12:00:00.123456Z",
  accountName: "Cash",
  accountType: "checking",
  ownedAccount: true,
};
const partner = {
  ...row,
  id: crypto.randomUUID(),
  accountId: crypto.randomUUID(),
  amountCents: 20000,
};
function form(
  value: unknown = { operation: "pair", expected: [row, partner] },
  confirmed = true,
) {
  const form = new FormData();
  form.set("review", JSON.stringify(value));
  if (confirmed) form.set("confirm", "on");
  return form;
}
beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  outsider = await f.newUser();
  ws = await f.newWorkspace({ [editor]: "editor", [viewer]: "viewer" });
});
afterAll(() => f.cleanUp());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: editor } });
  mocks.readReview.mockResolvedValue({
    accounts: [{ id: row.accountId, name: "Cash" }],
    rows: [],
    hasMore: false,
  });
  mocks.writeReview.mockResolvedValue("ok");
});
describe("transfer boundaries", () => {
  it.each(["anonymous", "viewer", "outsider"])(
    "denies %s writes before reading financial data",
    async (who) => {
      mocks.getSession.mockResolvedValue(
        who === "anonymous"
          ? null
          : { user: { id: who === "viewer" ? viewer : outsider } },
      );
      expect(
        isNotFound(
          await reviewTransferAction(ws, {}, form()).catch((e: unknown) => e),
        ),
      ).toBe(true);
      expect(mocks.writeReview).not.toHaveBeenCalled();
      expect(mocks.readReview).not.toHaveBeenCalled();
    },
  );
  it.each([null, "outsider"])(
    "denies unauthorized reads for %s",
    async (who) => {
      mocks.getSession.mockResolvedValue(
        who === null ? null : { user: { id: outsider } },
      );
      expect(
        isNotFound(await loadTransferReview(ws).catch((e: unknown) => e)),
      ).toBe(true);
      expect(mocks.readReview).not.toHaveBeenCalled();
    },
  );
  it("allows viewer reads, validates filters and uses the application timezone", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: viewer } });
    const data = await loadTransferReview(
      ws,
      {},
      new Date("2026-10-12T01:00:00Z"),
    );
    expect(data).toMatchObject({ canEdit: false, today: "2026-10-11" });
    expect(
      isNotFound(
        await loadTransferReview(ws, { account: crypto.randomUUID() }).catch(
          (e: unknown) => e,
        ),
      ),
    ).toBe(true);
    expect(
      isNotFound(
        await loadTransferReview(ws, { other: crypto.randomUUID() }).catch(
          (e: unknown) => e,
        ),
      ),
    ).toBe(true);
    expect(
      isNotFound(
        await loadTransferReview(ws, { source: row.id }).catch(
          (e: unknown) => e,
        ),
      ),
    ).toBe(true);
    mocks.readReview.mockClear();
    expect(
      isNotFound(
        await loadTransferReview(ws, { from: "bad" }).catch((e: unknown) => e),
      ),
    ).toBe(true);
    expect(mocks.readReview).not.toHaveBeenCalled();
  });
  it("allows editor read controls and a focused owned source", async () => {
    mocks.readReview.mockResolvedValue({
      accounts: [{ id: row.accountId, name: "Cash" }],
      rows: [{ row }],
      hasMore: false,
    });
    expect(
      await loadTransferReview(
        ws,
        { source: row.id, account: row.accountId, other: row.accountId },
        new Date("2026-10-11T16:00:00Z"),
      ),
    ).toMatchObject({ canEdit: true, rows: [{ row }] });
  });
  it("requires valid JSON, complete snapshots and explicit confirmation before writing", async () => {
    for (const data of [
      new FormData(),
      form({}, false),
      form({ operation: "pair", expected: [row] }),
      form(null),
      form({ operation: "pair", expected: [row, partner] }, false),
    ])
      expect((await reviewTransferAction(ws, {}, data)).ok).toBe(false);
    const bad = form();
    bad.set("review", "{");
    expect((await reviewTransferAction(ws, {}, bad)).message).toContain(
      "invalid",
    );
    const long = form();
    long.set("review", "x".repeat(100001));
    expect((await reviewTransferAction(ws, {}, long)).ok).toBe(false);
    const file = form();
    file.set("review", new File(["x"], "invalid.json"));
    expect((await reviewTransferAction(ws, {}, file)).ok).toBe(false);
    expect(mocks.writeReview).not.toHaveBeenCalled();
  });
  it.each([
    "ok",
    "already",
    "not_found",
    "stale",
    "ineligible",
    "paired",
    "allocated",
    "limit",
  ] as WriteResult[])("provides useful feedback for %s", async (result) => {
    mocks.writeReview.mockResolvedValue(result);
    const state = await reviewTransferAction(ws, {}, form());
    expect(state.message).toBeTruthy();
    expect(state.ok).toBe(result === "ok" || result === "already");
    expect(mocks.refresh).toHaveBeenCalledTimes(state.ok ? 1 : 0);
    expect(mocks.writeReview.mock.calls[0]![0]).toBe(ws);
  });
  it("redacts failure details and retains a retryable state", async () => {
    mocks.writeReview.mockRejectedValue(
      new Error("postgres://role:secret@host/database"),
    );
    const state = await reviewTransferAction(ws, {}, form());
    expect(state).toEqual({
      ok: false,
      message:
        "The review could not be saved. Your selection is kept; try again.",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
