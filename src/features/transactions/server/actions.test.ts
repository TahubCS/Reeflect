import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAccount } from "@/features/accounts/server/repository";
import { cents } from "@/lib/money";
import {
  fixtures,
  isNotFound,
  isRedirect,
} from "../../../../tests/support/db-fixtures";
import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
} from "./actions";
import {
  createTransaction,
  getTransaction,
  listTransactions,
} from "./repository";

// Integration tests against the Docker database (TEST-05); only the session
// is faked.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

const f = fixtures();
let editor: string;
let viewer: string;
let workspace: string;
let accountId: string;
let otherAccount: string;

const signedInAs = (id: string) =>
  getSession.mockResolvedValue({ user: { id } });

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const LUNCH = () => ({
  accountId,
  postedOn: "2026-01-15",
  direction: "out",
  amount: "12.50",
  description: "Lunch",
});

async function thrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}

const newTransaction = async (description: string) =>
  (await createTransaction(workspace, {
    description,
    isTransfer: false,
    ledger: {
      accountId,
      postedOn: "2026-01-10",
      amountCents: cents(-500),
      status: "posted",
    },
  }))!;

beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  workspace = await f.newWorkspace({ [editor]: "editor", [viewer]: "viewer" });
  const elsewhere = await f.newWorkspace({ [editor]: "owner" });
  const account = {
    type: "checking" as const,
    institutionName: "Bank",
    nickname: "Everyday",
    maskLast4: null,
    balanceCents: null,
  };
  accountId = await createAccount(workspace, account);
  otherAccount = await createAccount(elsewhere, account);
});

afterAll(async () => {
  await f.cleanUp();
});

describe("createTransactionAction", () => {
  it("adds the transaction for an editor and returns to the list", async () => {
    signedInAs(editor);

    const error = await thrown(
      createTransactionAction(workspace, { errors: {} }, form(LUNCH())),
    );

    expect(isRedirect(error)).toBe(true);
    const rows = await listTransactions(workspace, { accountId });
    expect(rows.find((t) => t.description === "Lunch")).toMatchObject({
      amountCents: -1250,
      postedOn: "2026-01-15",
      source: "manual",
    });
  });

  it("returns field errors and the typed values, writing nothing", async () => {
    signedInAs(editor);
    const before = (await listTransactions(workspace)).length;
    const data = form({ ...LUNCH(), amount: "lots", postedOn: "2999-01-01" });
    data.set("__proto__", "polluted");

    const state = await createTransactionAction(
      workspace,
      { errors: {} },
      data,
    );

    expect(state.errors).toEqual({
      amount: "Enter an amount above zero, like 12.50.",
      postedOn: "Enter today or an earlier date.",
    });
    expect(Object.keys(state.values ?? {}).sort()).toEqual([
      "accountId",
      "amount",
      "description",
      "direction",
      "postedOn",
    ]);
    expect(Object.getPrototypeOf(state.values)).toBe(Object.prototype);
    expect(await listTransactions(workspace)).toHaveLength(before);
  });

  it("refuses an account from another workspace, even one the user can see", async () => {
    signedInAs(editor);

    const state = await createTransactionAction(
      workspace,
      { errors: {} },
      form({ ...LUNCH(), accountId: otherAccount }),
    );

    expect(state.errors).toEqual({ accountId: "Choose one of your accounts." });
    expect(
      await listTransactions(workspace, { accountId: otherAccount }),
    ).toEqual([]);
  });

  it("refuses a viewer and a signed-out visitor", async () => {
    signedInAs(viewer);
    expect(
      isNotFound(
        await thrown(
          createTransactionAction(workspace, { errors: {} }, form(LUNCH())),
        ),
      ),
    ).toBe(true);

    getSession.mockResolvedValue(null);
    expect(
      isNotFound(
        await thrown(
          createTransactionAction(workspace, { errors: {} }, form(LUNCH())),
        ),
      ),
    ).toBe(true);
  });
});

describe("updateTransactionAction", () => {
  it("saves changes and returns to the list", async () => {
    signedInAs(editor);
    const id = await newTransaction("Old");

    const error = await thrown(
      updateTransactionAction(
        workspace,
        id,
        { errors: {} },
        form({ ...LUNCH(), description: "New", direction: "in", amount: "3" }),
      ),
    );

    expect(isRedirect(error)).toBe(true);
    expect(await getTransaction(workspace, id)).toMatchObject({
      description: "New",
      amountCents: 300,
    });
  });

  it("returns field errors without saving", async () => {
    signedInAs(editor);
    const id = await newTransaction("Keep me");

    const state = await updateTransactionAction(
      workspace,
      id,
      { errors: {} },
      form({ ...LUNCH(), description: "" }),
    );

    expect(state.errors.description).toBeDefined();
    expect((await getTransaction(workspace, id))?.description).toBe("Keep me");
  });

  it("refuses to move it into another workspace's account", async () => {
    signedInAs(editor);
    const id = await newTransaction("Stay here");

    const state = await updateTransactionAction(
      workspace,
      id,
      { errors: {} },
      form({ ...LUNCH(), accountId: otherAccount }),
    );

    expect(state.errors).toEqual({ accountId: "Choose one of your accounts." });
    expect((await getTransaction(workspace, id))?.accountId).toBe(accountId);
  });

  it.each([["not-a-uuid"], [crypto.randomUUID()], [undefined]])(
    "finds nothing for transaction id %j",
    async (transactionId) => {
      signedInAs(editor);

      expect(
        isNotFound(
          await thrown(
            updateTransactionAction(
              workspace,
              transactionId,
              { errors: {} },
              form(LUNCH()),
            ),
          ),
        ),
      ).toBe(true);
    },
  );
});

describe("deleteTransactionAction", () => {
  it("deletes for an editor, then finds nothing the second time", async () => {
    signedInAs(editor);
    const id = await newTransaction("Gone");

    expect(
      isRedirect(await thrown(deleteTransactionAction(workspace, id))),
    ).toBe(true);
    expect(await getTransaction(workspace, id)).toBeNull();
    expect(
      isNotFound(await thrown(deleteTransactionAction(workspace, id))),
    ).toBe(true);
  });

  it("refuses a viewer", async () => {
    signedInAs(viewer);
    const id = await newTransaction("Viewer cannot delete");

    expect(
      isNotFound(await thrown(deleteTransactionAction(workspace, id))),
    ).toBe(true);
    expect(await getTransaction(workspace, id)).not.toBeNull();
  });
});
