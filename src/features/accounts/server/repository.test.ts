import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { financialAccount, transaction } from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { fixtures } from "../../../../tests/support/db-fixtures";
import type { AccountInput } from "../domain/account-input";
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from "./repository";

// Integration tests: they need the PostgreSQL from `docker compose up -d`
// (or the CI service), migrated. See TEST-05.
const f = fixtures();
let workspaceA: string;
let workspaceB: string;

const input = (overrides: Partial<AccountInput> = {}): AccountInput => ({
  type: "checking",
  institutionName: "Capital One",
  nickname: "Everyday",
  maskLast4: "1234",
  balanceCents: cents(120450),
  ...overrides,
});

// 02:30 UTC on Oct 11 is Oct 10 in New York (DEFAULT_TIME_ZONE).
const NOW = new Date("2026-10-11T02:30:00Z");

beforeAll(async () => {
  workspaceA = await f.newWorkspace();
  workspaceB = await f.newWorkspace();
});

afterAll(async () => {
  await f.cleanUp();
});

describe("accounts repository", () => {
  it("creates a manual account with today's balance and lists it", async () => {
    const id = await createAccount(workspaceA, input(), NOW);

    expect(await getAccount(workspaceA, id)).toEqual({
      id,
      type: "checking",
      institutionName: "Capital One",
      nickname: "Everyday",
      maskLast4: "1234",
      balanceCents: 120450,
      balanceAsOf: "2026-10-10",
      source: "manual",
      balanceEditable: true,
    });
    expect((await listAccounts(workspaceA)).map((a) => a.id)).toContain(id);
  });

  it("lists in the order accounts were added", async () => {
    const workspace = await f.newWorkspace();
    const first = await createAccount(workspace, input({ nickname: "First" }));
    const second = await createAccount(
      workspace,
      input({ nickname: "Second" }),
    );

    expect((await listAccounts(workspace)).map((a) => a.id)).toEqual([
      first,
      second,
    ]);
  });

  it("updates details and a manual balance, keeping it when none is given", async () => {
    const id = await createAccount(workspaceA, input());

    expect(
      await updateAccount(
        workspaceA,
        id,
        input({
          type: "credit_card",
          nickname: "Card",
          balanceCents: cents(-30000),
        }),
        NOW,
      ),
    ).toBe(true);
    expect(await getAccount(workspaceA, id)).toMatchObject({
      type: "credit_card",
      nickname: "Card",
      balanceCents: -30000,
      balanceAsOf: "2026-10-10",
    });

    await updateAccount(
      workspaceA,
      id,
      input({ type: "credit_card", balanceCents: null }),
    );
    expect((await getAccount(workspaceA, id))?.balanceCents).toBe(-30000);
  });

  it("never changes the type or balance of a synced account", async () => {
    const [synced] = await db
      .insert(financialAccount)
      .values({
        workspaceId: workspaceA,
        type: "savings",
        institutionName: "Capital One",
        nickname: "Synced",
        source: "nessie",
        currentBalanceCents: 5000,
      })
      .returning({ id: financialAccount.id });

    await updateAccount(
      workspaceA,
      synced!.id,
      input({ type: "loan", nickname: "Renamed", balanceCents: cents(1) }),
    );

    expect(await getAccount(workspaceA, synced!.id)).toMatchObject({
      type: "savings",
      nickname: "Renamed",
      balanceCents: 5000,
      balanceEditable: false,
    });
  });

  it("keeps each workspace's accounts to itself", async () => {
    const id = await createAccount(workspaceA, input({ nickname: "Private" }));

    expect(await getAccount(workspaceB, id)).toBeNull();
    expect((await listAccounts(workspaceB)).map((a) => a.id)).not.toContain(id);
    expect(
      await updateAccount(workspaceB, id, input({ nickname: "Taken" })),
    ).toBe(false);
    expect(await deleteAccount(workspaceB, id)).toBe(false);
    expect((await getAccount(workspaceA, id))?.nickname).toBe("Private");
  });

  it("deletes an account and its transactions (ADR-025)", async () => {
    const id = await createAccount(workspaceA, input());
    await db.insert(transaction).values({
      workspaceId: workspaceA,
      financialAccountId: id,
      postedOn: "2026-10-01",
      amountCents: -1299,
      descriptionRaw: "Coffee",
      source: "manual",
      fingerprint: `test-${id}`,
    });

    expect(await deleteAccount(workspaceA, id)).toBe(true);
    expect(await getAccount(workspaceA, id)).toBeNull();
    expect(
      await db
        .select()
        .from(transaction)
        .where(eq(transaction.financialAccountId, id)),
    ).toEqual([]);
    expect(await deleteAccount(workspaceA, id)).toBe(false);
  });
});
