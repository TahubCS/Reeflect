import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { financialAccount } from "@/lib/db/schema";
import { fixtures, isNotFound } from "../../../../tests/support/db-fixtures";
import { nessieStatusAction, syncNessieAction } from "./actions";
import * as sync from "./sync";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession: session }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const f = fixtures();
let linked: string;
let plain: string;
let editor: string;
let viewer: string;
let stranger: string;
const SYNCED_AT = new Date("2026-10-11T12:00:00Z");

async function thrown(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected notFound");
}
const as = (userId: string | null) =>
  session.mockResolvedValue(userId ? { user: { id: userId } } : null);

beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  stranger = await f.newUser();
  linked = await f.newWorkspace({ [editor]: "editor", [viewer]: "viewer" });
  plain = await f.newWorkspace({ [editor]: "owner" });
  await db.insert(financialAccount).values({
    workspaceId: linked,
    nickname: "Sandbox checking",
    institutionName: "Capital One",
    type: "checking",
    source: "nessie",
    nessieAccountId: crypto.randomUUID(),
    balanceAsOf: "2026-10-11",
    updatedAt: SYNCED_AT,
  });
});
afterAll(() => f.cleanUp());

describe("nessieStatusAction", () => {
  it("tells an editor the workspace is linked and may sync", async () => {
    as(editor);
    expect(await nessieStatusAction(linked)).toEqual({
      linked: true,
      lastSyncedAt: SYNCED_AT.toISOString(),
      canSync: true,
    });
  });

  it("shows a viewer the time but not the button", async () => {
    as(viewer);
    expect(await nessieStatusAction(linked)).toMatchObject({
      linked: true,
      canSync: false,
    });
  });

  it("reports a workspace with no Nessie accounts as not linked", async () => {
    as(editor);
    expect(await nessieStatusAction(plain)).toEqual({
      linked: false,
      lastSyncedAt: null,
      canSync: true,
    });
  });

  it("reads as not linked for a stranger, a signed-out visitor or a bad id", async () => {
    const notLinked = { linked: false, lastSyncedAt: null, canSync: false };
    as(stranger);
    expect(await nessieStatusAction(linked)).toEqual(notLinked);
    as(null);
    expect(await nessieStatusAction(linked)).toEqual(notLinked);
    as(editor);
    expect(await nessieStatusAction("../x")).toEqual(notLinked);
  });
});

describe("syncNessieAction from the header", () => {
  it("does not let a viewer sync", async () => {
    const run = vi.spyOn(sync, "syncNessieWorkspace");
    as(viewer);
    expect(isNotFound(await thrown(syncNessieAction(linked)))).toBe(true);
    expect(run).not.toHaveBeenCalled();
    run.mockRestore();
  });
});
