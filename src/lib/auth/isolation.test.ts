import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ACCOUNT_ENTRY_POINTS } from "@/features/accounts/server/entry-points";
import {
  createAccount,
  listAccounts,
} from "@/features/accounts/server/repository";
import {
  fixtures,
  isNotFound,
  isRedirect,
} from "../../../tests/support/db-fixtures";
import type { EntryPoint, EntryPointTarget } from "./entry-point";

// TEST-06, the workspace isolation matrix. Every feature's entry points are
// listed below; a new feature adds its `server/entry-points.ts` list here.
// User A is a member of workspace A only. Calling any entry point with
// workspace B's ids, or with A's workspace and B's object ids, must find
// nothing and change nothing in B.
const ENTRY_POINTS: EntryPoint[] = [...ACCOUNT_ENTRY_POINTS];

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

const f = fixtures();
let userA: string;
let viewerB: string;
let a: EntryPointTarget;
let b: EntryPointTarget;

async function outcome(entry: EntryPoint, target: EntryPointTarget) {
  try {
    await entry.call(target);
    return "returned";
  } catch (error) {
    if (isNotFound(error)) return "not found";
    if (isRedirect(error)) return "redirected";
    throw error;
  }
}

async function snapshotB() {
  return listAccounts(b.workspaceId);
}

async function newAccount(workspaceId: string): Promise<string> {
  return createAccount(workspaceId, {
    type: "checking",
    institutionName: "Bank",
    nickname: "Isolation target",
    maskLast4: null,
    balanceCents: null,
  });
}

beforeAll(async () => {
  userA = await f.newUser();
  const ownerB = await f.newUser();
  viewerB = await f.newUser();
  const workspaceA = await f.newWorkspace({ [userA]: "owner" });
  const workspaceB = await f.newWorkspace({
    [ownerB]: "owner",
    [viewerB]: "viewer",
  });
  a = { workspaceId: workspaceA, accountId: await newAccount(workspaceA) };
  b = { workspaceId: workspaceB, accountId: await newAccount(workspaceB) };
});

afterAll(async () => {
  await f.cleanUp();
});

describe.each(ENTRY_POINTS)("$name", (entry) => {
  it("finds nothing in a workspace the user is not a member of", async () => {
    getSession.mockResolvedValue({ user: { id: userA } });
    const before = await snapshotB();

    expect(await outcome(entry, b)).toBe("not found");
    expect(await snapshotB()).toEqual(before);
  });

  it("never reaches another workspace's objects through its own", async () => {
    getSession.mockResolvedValue({ user: { id: userA } });
    const before = await snapshotB();

    await outcome(entry, { ...a, accountId: b.accountId });

    expect(await snapshotB()).toEqual(before);
  });

  it(`refuses a role below ${entry.minimumRole}`, async () => {
    getSession.mockResolvedValue({ user: { id: viewerB } });
    const before = await snapshotB();

    const result = await outcome(entry, b);

    if (entry.minimumRole === "viewer") expect(result).not.toBe("not found");
    else expect(result).toBe("not found");
    expect(await snapshotB()).toEqual(before);
  });

  it("refuses a signed-out visitor", async () => {
    getSession.mockResolvedValue(null);

    expect(await outcome(entry, b)).toBe("not found");
  });
});

describe("the matrix", () => {
  it("covers at least one entry point per registered feature", () => {
    expect(ENTRY_POINTS.length).toBeGreaterThan(0);
    expect(new Set(ENTRY_POINTS.map((e) => e.name)).size).toBe(
      ENTRY_POINTS.length,
    );
  });
});
