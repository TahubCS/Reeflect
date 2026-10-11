import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  fixtures,
  isNotFound,
  isRedirect,
} from "../../../../tests/support/db-fixtures";
import {
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from "./actions";
import { createAccount, getAccount, listAccounts } from "./repository";
import { statementStore } from "@/lib/storage";
import { statementCsvKey } from "@/lib/storage/keys";

// Integration tests against the Docker database (TEST-05); only the session
// is faked.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

const f = fixtures();
let editor: string;
let viewer: string;
let workspace: string;

const signedInAs = (id: string) =>
  getSession.mockResolvedValue({ user: { id } });

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const CARD = {
  type: "credit_card",
  institutionName: "Capital One",
  nickname: "Quicksilver",
  maskLast4: "4321",
  balance: "300",
};

async function thrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}

beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  workspace = await f.newWorkspace({ [editor]: "editor", [viewer]: "viewer" });
});

afterAll(async () => {
  await f.cleanUp();
});

describe("createAccountAction", () => {
  it("adds the account for an editor and returns to the list", async () => {
    signedInAs(editor);

    const error = await thrown(
      createAccountAction(workspace, { errors: {} }, form(CARD)),
    );

    expect(isRedirect(error)).toBe(true);
    const accounts = await listAccounts(workspace);
    expect(accounts.find((a) => a.nickname === "Quicksilver")).toMatchObject({
      type: "credit_card",
      balanceCents: -30000,
      source: "manual",
    });
  });

  it("returns field errors and writes nothing for bad input", async () => {
    signedInAs(editor);
    const before = (await listAccounts(workspace)).length;

    const state = await createAccountAction(
      workspace,
      { errors: {} },
      form({ ...CARD, maskLast4: "4111111111111111" }),
    );

    expect(state.errors.maskLast4).toBe(
      "Enter only the last 4 digits, or leave it blank.",
    );
    // What was typed comes back, since React resets the form after an action.
    expect(state.values).toMatchObject({
      nickname: "Quicksilver",
      maskLast4: "4111111111111111",
    });
    expect(await listAccounts(workspace)).toHaveLength(before);
  });

  it("echoes back only the form's own fields, never names from the request", async () => {
    signedInAs(editor);
    const data = form({ ...CARD, balance: "lots" });
    data.set("__proto__", "polluted");
    data.set("toString", "polluted");
    data.set("extra", "ignored");

    const state = await createAccountAction(workspace, { errors: {} }, data);

    expect(Object.keys(state.values ?? {}).sort()).toEqual([
      "balance",
      "institutionName",
      "maskLast4",
      "nickname",
      "type",
    ]);
    expect(Object.getPrototypeOf(state.values)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses a viewer and a signed-out visitor", async () => {
    signedInAs(viewer);
    expect(
      isNotFound(
        await thrown(
          createAccountAction(workspace, { errors: {} }, form(CARD)),
        ),
      ),
    ).toBe(true);

    getSession.mockResolvedValue(null);
    expect(
      isNotFound(
        await thrown(
          createAccountAction(workspace, { errors: {} }, form(CARD)),
        ),
      ),
    ).toBe(true);
  });
});

describe("updateAccountAction", () => {
  it("saves changes and returns to the list", async () => {
    signedInAs(editor);
    const id = await createAccount(workspace, {
      type: "checking",
      institutionName: "Bank",
      nickname: "Old name",
      maskLast4: null,
      balanceCents: null,
    });

    const error = await thrown(
      updateAccountAction(
        workspace,
        id,
        { errors: {} },
        form({
          ...CARD,
          type: "checking",
          nickname: "New name",
          balance: "50",
        }),
      ),
    );

    expect(isRedirect(error)).toBe(true);
    expect(await getAccount(workspace, id)).toMatchObject({
      nickname: "New name",
      balanceCents: 5000,
    });
  });

  it("returns field errors without saving", async () => {
    signedInAs(editor);
    const id = await createAccount(workspace, {
      type: "savings",
      institutionName: "Bank",
      nickname: "Keep me",
      maskLast4: null,
      balanceCents: null,
    });

    const state = await updateAccountAction(
      workspace,
      id,
      { errors: {} },
      form({ ...CARD, type: "savings", nickname: "" }),
    );

    expect(state.errors.nickname).toBeDefined();
    expect((await getAccount(workspace, id))?.nickname).toBe("Keep me");
  });

  it.each([["not-a-uuid"], [crypto.randomUUID()], [undefined]])(
    "finds nothing for account id %j",
    async (accountId) => {
      signedInAs(editor);

      expect(
        isNotFound(
          await thrown(
            updateAccountAction(
              workspace,
              accountId,
              { errors: {} },
              form(CARD),
            ),
          ),
        ),
      ).toBe(true);
    },
  );
});

describe("deleteAccountAction", () => {
  it("deletes for an editor, then finds nothing the second time", async () => {
    signedInAs(editor);
    const id = await createAccount(workspace, {
      type: "loan",
      institutionName: "Bank",
      nickname: "Car loan",
      maskLast4: null,
      balanceCents: null,
    });

    expect(isRedirect(await thrown(deleteAccountAction(workspace, id)))).toBe(
      true,
    );
    expect(await getAccount(workspace, id)).toBeNull();
    expect(isNotFound(await thrown(deleteAccountAction(workspace, id)))).toBe(
      true,
    );
  });

  it("deletes the account's stored statement files and no one else's", async () => {
    signedInAs(editor);
    const id = await createAccount(workspace, {
      type: "checking",
      institutionName: "Bank",
      nickname: "With statements",
      maskLast4: null,
      balanceCents: null,
    });
    const store = statementStore()!;
    const mine = statementCsvKey(workspace, id, "batch-1");
    const other = statementCsvKey(workspace, "another-account", "batch-1");
    await store.put(mine, "csv", "text/csv");
    await store.put(other, "csv", "text/csv");

    await thrown(deleteAccountAction(workspace, id));

    expect(await store.get(mine)).toBeNull();
    expect(await store.get(other)).toBe("csv");
    await store.delete(other);
  });
});
