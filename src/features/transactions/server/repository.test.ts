import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAccount,
  getAccount,
} from "@/features/accounts/server/repository";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { financialAccount, transaction } from "@/lib/db/schema";
import {
  ensureCategories,
  listCategories,
  saveOverride,
} from "@/features/categorization/server/repository";
import { cents } from "@/lib/money";
import { fixtures } from "../../../../tests/support/db-fixtures";
import type { LedgerInput } from "../domain/transaction-input";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  listTransactionsBetween,
  updateTransaction,
} from "./repository";

// Integration tests: they need the PostgreSQL from `docker compose up -d`
// (or the CI service), migrated. See TEST-05.
const f = fixtures();
let workspaceA: string;
let workspaceB: string;

// The balance date every manual account here starts from (ADR-050).
const AS_OF = "2026-10-05";

async function account(
  workspaceId: string,
  balance: number,
  source: "manual" | "nessie" = "manual",
): Promise<string> {
  const id = await createAccount(workspaceId, {
    type: "checking",
    institutionName: "Bank",
    nickname: `Account ${balance}`,
    maskLast4: null,
    balanceCents: cents(balance),
  });
  await db
    .update(financialAccount)
    .set({ balanceAsOf: AS_OF, source })
    .where(eq(financialAccount.id, id));
  return id;
}

const balanceOf = async (workspaceId: string, id: string) =>
  (await getAccount(workspaceId, id))?.balanceCents;

function add(
  workspaceId: string,
  ledger: Partial<LedgerInput> & { accountId: string },
  description = "Lunch",
) {
  return createTransaction(workspaceId, {
    description,
    isTransfer: false,
    ledger: {
      postedOn: "2026-10-08",
      amountCents: cents(-1250),
      status: "posted",
      ...ledger,
    },
  });
}

beforeAll(async () => {
  workspaceA = await f.newWorkspace();
  workspaceB = await f.newWorkspace();
});

afterAll(async () => {
  await f.cleanUp();
});

describe("createTransaction", () => {
  it("adds a manual transaction and moves a manual account's balance", async () => {
    const accountId = await account(workspaceA, 10_000);

    const id = await add(workspaceA, { accountId });

    expect(id).not.toBeNull();
    expect(await getTransaction(workspaceA, id!)).toEqual({
      id,
      accountId,
      accountNickname: "Account 10000",
      accountType: "checking",
      postedOn: "2026-10-08",
      amountCents: -1250,
      description: "Lunch",
      status: "posted",
      isTransfer: false,
      source: "manual",
      editableInFull: true,
    });
    expect(await balanceOf(workspaceA, accountId)).toBe(8750);
  });

  it("leaves the balance alone for a date before the balance was typed", async () => {
    const accountId = await account(workspaceA, 10_000);

    await add(workspaceA, { accountId, postedOn: "2026-10-01" });

    expect(await balanceOf(workspaceA, accountId)).toBe(10_000);
  });

  it("never moves a synced account's balance", async () => {
    const accountId = await account(workspaceA, 10_000, "nessie");

    await add(workspaceA, { accountId });

    expect(await balanceOf(workspaceA, accountId)).toBe(10_000);
  });

  it("keeps two identical entries on one day as two transactions", async () => {
    const accountId = await account(workspaceA, 0);

    await add(workspaceA, { accountId }, "Coffee");
    await add(workspaceA, { accountId }, "Coffee");

    expect(await listTransactions(workspaceA, { accountId })).toHaveLength(2);
    expect(await balanceOf(workspaceA, accountId)).toBe(-2500);
  });

  it("refuses another workspace's account and writes nothing", async () => {
    const theirs = await account(workspaceB, 10_000);

    expect(await add(workspaceA, { accountId: theirs })).toBeNull();
    expect(await listTransactions(workspaceB)).toEqual([]);
    expect(await balanceOf(workspaceB, theirs)).toBe(10_000);
  });
});

describe("createTransaction with a given id", () => {
  it("adds the row once and moves the balance once (ADR-102)", async () => {
    const accountId = await account(workspaceA, 10_000);
    const id = uuidv7();
    const input = {
      id,
      description: "Concert tickets",
      isTransfer: false,
      ledger: {
        accountId,
        postedOn: "2026-10-08",
        amountCents: cents(-4500),
        status: "posted" as const,
      },
    };

    expect(await createTransaction(workspaceA, input)).toBe(id);
    expect(await createTransaction(workspaceA, input)).toBe(id);

    expect(await getTransaction(workspaceA, id)).toMatchObject({
      id,
      amountCents: -4500,
    });
    expect(await balanceOf(workspaceA, accountId)).toBe(10_000 - 4500);
  });

  it("gives nothing when that id is another workspace's transaction", async () => {
    const theirs = await account(workspaceB, 0);
    const id = (await add(workspaceB, { accountId: theirs }))!;
    const mine = await account(workspaceA, 0);

    expect(
      await createTransaction(workspaceA, {
        id,
        description: "Lunch",
        isTransfer: false,
        ledger: {
          accountId: mine,
          postedOn: "2026-10-08",
          amountCents: cents(-1250),
          status: "posted",
        },
      }),
    ).toBeNull();
    expect(await balanceOf(workspaceA, mine)).toBe(0);
  });
});

describe("listTransactions", () => {
  it("lists newest first, filters by account and never shows other workspaces", async () => {
    const workspace = await f.newWorkspace();
    const one = await account(workspace, 0);
    const two = await account(workspace, 0);
    const old = await add(workspace, {
      accountId: one,
      postedOn: "2026-10-06",
    });
    const recent = await add(workspace, {
      accountId: two,
      postedOn: "2026-10-09",
    });
    const sameDayLater = await add(workspace, {
      accountId: one,
      postedOn: "2026-10-09",
    });

    expect((await listTransactions(workspace)).map((t) => t.id)).toEqual([
      sameDayLater,
      recent,
      old,
    ]);
    expect(
      (await listTransactions(workspace, { accountId: one })).map((t) => t.id),
    ).toEqual([sameDayLater, old]);
    expect(await listTransactions(workspace, { limit: 1 })).toHaveLength(1);
    expect(await listTransactions(workspaceB, { accountId: one })).toEqual([]);
    expect(await getTransaction(workspaceB, old!)).toBeNull();
  });
});

describe("listTransactionsBetween", () => {
  it("lists the window's rows oldest first, with their category, and never other workspaces", async () => {
    const accountId = await account(workspaceA, 20_000);
    const otherAccount = await account(workspaceB, 20_000);
    await ensureCategories(workspaceA);
    const housing = (await listCategories(workspaceA)).find(
      (c) => c.presetKey === "housing",
    )!;
    const before = await add(workspaceA, { accountId, postedOn: "2026-08-31" });
    const late = await add(workspaceA, { accountId, postedOn: "2026-10-09" });
    const rent = await add(
      workspaceA,
      { accountId, postedOn: "2026-09-01", amountCents: cents(-90000) },
      "Rent",
    );
    await saveOverride(workspaceA, rent!, {
      mode: "manual",
      categoryId: housing.id,
    });
    await add(workspaceB, { accountId: otherAccount, postedOn: "2026-09-15" });

    const rows = await listTransactionsBetween(
      workspaceA,
      "2026-09-01",
      "2026-10-31",
    );
    const mine = rows.filter((r) => r.accountId === accountId);

    expect(mine.map((r) => r.id)).toEqual([rent, late]);
    expect(mine.map((r) => r.id)).not.toContain(before);
    expect(mine[0]).toEqual({
      id: rent,
      accountId,
      postedOn: "2026-09-01",
      amountCents: -90000,
      description: "Rent",
      isTransfer: false,
      source: "manual",
      categoryName: "Housing",
      categoryPresetKey: "housing",
      editableInFull: true,
    });
    expect(rows.every((r) => r.accountId !== otherAccount)).toBe(true);
  });
});

describe("updateTransaction", () => {
  it("takes back the old effect and applies the new one", async () => {
    const accountId = await account(workspaceA, 10_000);
    const id = (await add(workspaceA, { accountId }))!;

    expect(
      await updateTransaction(workspaceA, id, {
        description: "Dinner",
        isTransfer: true,
        ledger: {
          accountId,
          postedOn: "2026-10-09",
          amountCents: cents(-4000),
          status: "pending",
        },
      }),
    ).toBe("updated");

    expect(await getTransaction(workspaceA, id)).toMatchObject({
      description: "Dinner",
      isTransfer: true,
      amountCents: -4000,
      status: "pending",
    });
    expect(await balanceOf(workspaceA, accountId)).toBe(6000);
  });

  it("moves the effect when the date crosses the balance date", async () => {
    const accountId = await account(workspaceA, 10_000);
    const id = (await add(workspaceA, { accountId }))!;

    await updateTransaction(workspaceA, id, {
      description: "Lunch",
      isTransfer: false,
      ledger: {
        accountId,
        postedOn: "2026-10-01",
        amountCents: cents(-1250),
        status: "posted",
      },
    });

    expect(await balanceOf(workspaceA, accountId)).toBe(10_000);
  });

  it("moves the effect from one account to another", async () => {
    const from = await account(workspaceA, 10_000);
    const to = await account(workspaceA, 20_000);
    const id = (await add(workspaceA, { accountId: from }))!;

    await updateTransaction(workspaceA, id, {
      description: "Lunch",
      isTransfer: false,
      ledger: {
        accountId: to,
        postedOn: "2026-10-08",
        amountCents: cents(-1250),
        status: "posted",
      },
    });

    expect(await balanceOf(workspaceA, from)).toBe(10_000);
    expect(await balanceOf(workspaceA, to)).toBe(18_750);
    expect((await getTransaction(workspaceA, id))?.accountId).toBe(to);
  });

  it("refuses to move a transaction into another workspace's account", async () => {
    const mine = await account(workspaceA, 10_000);
    const theirs = await account(workspaceB, 10_000);
    const id = (await add(workspaceA, { accountId: mine }))!;

    expect(
      await updateTransaction(workspaceA, id, {
        description: "Moved",
        isTransfer: false,
        ledger: {
          accountId: theirs,
          postedOn: "2026-10-08",
          amountCents: cents(-1250),
          status: "posted",
        },
      }),
    ).toBe("no such account");
    expect(await getTransaction(workspaceA, id)).toMatchObject({
      accountId: mine,
      description: "Lunch",
    });
    expect(await balanceOf(workspaceA, mine)).toBe(8750);
    expect(await balanceOf(workspaceB, theirs)).toBe(10_000);
  });

  it("changes only the description and transfer mark of an imported row", async () => {
    const accountId = await account(workspaceA, 10_000);
    const id = (await add(workspaceA, { accountId }))!;
    await db
      .update(transaction)
      .set({ source: "csv" })
      .where(eq(transaction.id, id));

    await updateTransaction(workspaceA, id, {
      description: "Renamed",
      isTransfer: true,
      ledger: {
        accountId,
        postedOn: "2026-10-09",
        amountCents: cents(-99_999),
        status: "pending",
      },
    });

    expect(await getTransaction(workspaceA, id)).toMatchObject({
      description: "Renamed",
      isTransfer: true,
      amountCents: -1250,
      postedOn: "2026-10-08",
      status: "posted",
      editableInFull: false,
    });
    expect(await balanceOf(workspaceA, accountId)).toBe(8750);
  });

  it("finds nothing in another workspace", async () => {
    const accountId = await account(workspaceA, 0);
    const id = (await add(workspaceA, { accountId }))!;

    expect(
      await updateTransaction(workspaceB, id, {
        description: "Hijacked",
        isTransfer: false,
        ledger: null,
      }),
    ).toBe("not found");
    expect((await getTransaction(workspaceA, id))?.description).toBe("Lunch");
  });
});

describe("deleteTransaction", () => {
  it("deletes and takes back its balance effect", async () => {
    const accountId = await account(workspaceA, 10_000);
    const id = (await add(workspaceA, { accountId }))!;

    expect(await deleteTransaction(workspaceB, id)).toBe(false);
    expect(await deleteTransaction(workspaceA, id)).toBe(true);

    expect(await getTransaction(workspaceA, id)).toBeNull();
    expect(await balanceOf(workspaceA, accountId)).toBe(10_000);
    expect(await deleteTransaction(workspaceA, id)).toBe(false);
  });

  it("leaves the balance alone when deleting an imported row", async () => {
    const accountId = await account(workspaceA, 10_000);
    const id = (await add(workspaceA, { accountId }))!;
    await db
      .update(transaction)
      .set({ source: "csv" })
      .where(eq(transaction.id, id));

    expect(await deleteTransaction(workspaceA, id)).toBe(true);
    expect(await balanceOf(workspaceA, accountId)).toBe(8750);
  });
});
