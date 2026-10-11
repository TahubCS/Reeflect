import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureCategories } from "@/features/categorization";
import { db } from "@/lib/db/client";
import { category, financialAccount, transaction } from "@/lib/db/schema";
import { fixtures } from "../../../../tests/support/db-fixtures";
import type { NessieClient } from "../api";
import type { AccountRecords, NessieAccount } from "../domain/records";
import { syncNessieWorkspace } from "./sync";

// A purchase refunded in Nessie (`pnpm nessie demo refund`): the refund is
// its own deposit tagged `[refund:<purchase id>]`. Both rows stay in the
// history, and the refund takes the purchase's category.

const f = fixtures();
let workspace: string;
let accountId: string;
const NESSIE_ID = `acct-${crypto.randomUUID()}`;
const NOW = new Date("2026-10-11T16:00:00Z");

const account: NessieAccount = {
  _id: NESSIE_ID,
  type: "Checking",
  nickname: "Sandbox checking",
  balance: 500,
};
const purchase = {
  _id: "p-dinner",
  purchase_date: "2026-10-08",
  amount: 64,
  status: "completed",
  description: "Dinner at Luca's [cat:dining]",
};
const refund = {
  _id: "d-refund",
  transaction_date: "2026-10-10",
  amount: 64,
  status: "completed",
  description: "Refund: Dinner at Luca's [refund:p-dinner]",
};

function client(records: Omit<AccountRecords, "account">): NessieClient {
  return {
    getAccount: async () => account,
    accountRecords: async () => ({ account, ...records }),
  } as unknown as NessieClient;
}

const rows = () =>
  db
    .select({
      description: transaction.descriptionRaw,
      amount: transaction.amountCents,
      categoryId: transaction.categoryId,
      categoryIsManual: transaction.categoryIsManual,
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.workspaceId, workspace),
        eq(transaction.financialAccountId, accountId),
      ),
    )
    .orderBy(transaction.postedOn);

async function presetId(key: string) {
  const [row] = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(eq(category.workspaceId, workspace), eq(category.presetKey, key)),
    );
  return row!.id;
}

beforeAll(async () => {
  workspace = await f.newWorkspace();
  await ensureCategories(workspace);
  const [row] = await db
    .insert(financialAccount)
    .values({
      workspaceId: workspace,
      nickname: "Sandbox checking",
      institutionName: "Capital One",
      type: "checking",
      source: "nessie",
      nessieAccountId: NESSIE_ID,
    })
    .returning({ id: financialAccount.id });
  accountId = row!.id;
});
afterAll(() => f.cleanUp());

describe("a refunded Nessie purchase", () => {
  it("keeps the purchase and adds the refund in the purchase's category", async () => {
    const result = await syncNessieWorkspace(workspace, {
      client: client({
        purchases: [purchase],
        deposits: [refund],
        withdrawals: [],
        bills: [],
      }),
      now: NOW,
    });
    expect(result).toMatchObject({ status: "synced", added: 2, removed: 0 });
    const dining = await presetId("dining");
    expect(await rows()).toEqual([
      {
        description: "Dinner at Luca's",
        amount: -6400,
        categoryId: dining,
        categoryIsManual: false,
      },
      {
        description: "Refund: Dinner at Luca's",
        amount: 6400,
        categoryId: dining,
        categoryIsManual: false,
      },
    ]);
  });

  it("never changes a category the person chose for the refund", async () => {
    const groceries = await presetId("groceries");
    await db
      .update(transaction)
      .set({ categoryId: groceries, categoryIsManual: true })
      .where(
        and(
          eq(transaction.workspaceId, workspace),
          eq(transaction.externalId, "deposit:d-refund"),
        ),
      );
    await syncNessieWorkspace(workspace, {
      client: client({
        purchases: [purchase],
        deposits: [refund],
        withdrawals: [],
        bills: [],
      }),
      now: NOW,
    });
    expect((await rows())[1]).toMatchObject({
      categoryId: groceries,
      categoryIsManual: true,
    });
  });

  it("removes only the refund when the refund is undone in Nessie", async () => {
    const result = await syncNessieWorkspace(workspace, {
      client: client({
        purchases: [purchase],
        deposits: [],
        withdrawals: [],
        bills: [],
      }),
      now: NOW,
    });
    expect(result).toMatchObject({ status: "synced", removed: 1 });
    expect((await rows()).map((row) => row.description)).toEqual([
      "Dinner at Luca's",
    ]);
  });
});
