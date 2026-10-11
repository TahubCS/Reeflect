import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { billPayment, financialAccount, transaction } from "@/lib/db/schema";
import { fixtures } from "../../../../tests/support/db-fixtures";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/features/transactions/server/repository";
import { deleteAccount } from "@/features/accounts/server/repository";
import {
  linkBillPayment,
  readBills,
  saveBill,
  unlinkBillPayment,
} from "@/features/bills";
import { cents } from "@/lib/money";
import {
  reviewQuery,
  type ReviewRow,
  type ReviewWrite,
} from "../domain/review";
import { readReview, writeReview } from "./repository";
const f = fixtures();
const today = "2026-10-11",
  now = new Date(`${today}T16:00:00Z`);
afterAll(() => f.cleanUp());
afterEach(() => vi.restoreAllMocks());
async function setup() {
  const ws = await f.newWorkspace();
  const accounts = await db
    .insert(financialAccount)
    .values([
      {
        workspaceId: ws,
        institutionName: "Test",
        nickname: "Cash",
        type: "checking" as const,
        source: "manual",
        currentBalanceCents: 50000,
        balanceAsOf: "2026-10-01",
      },
      {
        workspaceId: ws,
        institutionName: "Test",
        nickname: "Card",
        type: "credit_card" as const,
        source: "manual",
        currentBalanceCents: -10000,
        balanceAsOf: "2026-10-01",
      },
    ])
    .returning();
  return { ws, cash: accounts[0]!, card: accounts[1]! };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function row(
  fx: Fixture,
  extra: Partial<typeof transaction.$inferInsert> = {},
) {
  const [r] = await db
    .insert(transaction)
    .values({
      workspaceId: fx.ws,
      financialAccountId: fx.cash.id,
      postedOn: today,
      amountCents: -20000,
      descriptionRaw: "Repayment",
      source: "csv" as const,
      fingerprint: crypto.randomUUID(),
      ...extra,
    })
    .returning();
  return r!;
}
async function pair(
  fx: Fixture,
  extra: Partial<typeof transaction.$inferInsert> = {},
) {
  const a = await row(fx, extra);
  const b = await row(fx, {
    financialAccountId: fx.card.id,
    amountCents: 20000,
    ...extra,
  });
  return [a.id, b.id];
}
const read = (fx: Fixture, query = {}) =>
  readReview(fx.ws, reviewQuery({ view: "all", ...query }, today)!, today);
async function states(fx: Fixture, ids: string[]): Promise<ReviewRow[]> {
  return Promise.all(
    ids.map(
      async (source) =>
        (
          await readReview(
            fx.ws,
            reviewQuery({ view: "all", source }, "2026-10-12")!,
            "2026-10-12",
          )
        ).rows[0]!.row,
    ),
  );
}
const request = (expected: ReviewRow[]): ReviewWrite => ({
  operation: "pair",
  expected,
  confirmed: true,
});
const records = (ws: string) =>
  db
    .select()
    .from(transaction)
    .where(eq(transaction.workspaceId, ws))
    .orderBy(transaction.id);
const balances = (ws: string) =>
  db
    .select()
    .from(financialAccount)
    .where(eq(financialAccount.workspaceId, ws))
    .orderBy(financialAccount.id);
const withoutLabels = (rows: Awaited<ReturnType<typeof records>>) =>
  rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => !["isTransfer", "transferPairId", "updatedAt"].includes(key),
      ),
    ),
  );
async function detach(fx: Fixture, id: string) {
  const data = (await read(fx, { source: id })).rows[0]!;
  return writeReview(
    fx.ws,
    { operation: "detach", expected: data.members, confirmed: true },
    today,
  );
}
async function label(fx: Fixture, id: string, transfer: boolean) {
  return writeReview(
    fx.ws,
    {
      operation: "label",
      expected: await states(fx, [id]),
      transfer,
      confirmed: true,
    },
    today,
  );
}
async function bill(fx: Fixture, debt = false) {
  const target = { accountId: fx.cash.id, merchant: "repayment" };
  expect(
    await saveBill(fx.ws, {
      ...target,
      name: "Repayment",
      kind: "bill",
      amountMode: "fixed",
      unit: "months",
      every: 1,
      amountCents: 20000,
      nextOn: today,
      useHistory: false,
      autopay: false,
      liabilityAccountId: debt ? fx.card.id : null,
      invoiceCents: 20000,
    }),
  ).toBe("ok");
  return target;
}
describe("transfer review on PostgreSQL", () => {
  it("reads suggestions without changing any row, and confirms atomically with exact metadata-only changes", async () => {
    const fx = await setup(),
      ids = await pair(fx);
    const before = await records(fx.ws),
      accounts = await balances(fx.ws);
    const data = await read(fx);
    expect(
      data.rows.find((r) => r.row.id === ids[0])?.candidates.map((r) => r.id),
    ).toEqual([ids[1]]);
    expect(await records(fx.ws)).toEqual(before);
    const expected = await states(fx, ids);
    expect(await writeReview(fx.ws, request(expected), today)).toBe("ok");
    const after = await records(fx.ws);
    expect(
      after.every(
        (r) => r.isTransfer && r.transferPairId === after[0]!.transferPairId,
      ),
    ).toBe(true);
    expect(after[0]!.transferPairId).not.toBeNull();
    expect(withoutLabels(after)).toEqual(withoutLabels(before));
    expect(await balances(fx.ws)).toEqual(accounts);
    expect(await writeReview(fx.ws, request(expected), today)).toBe("already");
    expect(await records(fx.ws)).toEqual(after);
  });
  it("serializes duplicate and competing confirmations", async () => {
    const fx = await setup(),
      ids = await pair(fx);
    const third = await row(fx, {
      financialAccountId: fx.card.id,
      amountCents: 20000,
    });
    const first = request(await states(fx, ids));
    const competing = request(await states(fx, [ids[0]!, third.id]));
    expect(
      (
        await Promise.all([
          writeReview(fx.ws, first, today),
          writeReview(fx.ws, first, today),
        ])
      ).sort(),
    ).toEqual(["already", "ok"]);
    expect(await writeReview(fx.ws, competing, today)).toBe("stale");
    const fx2 = await setup(),
      ids2 = await pair(fx2),
      third2 = await row(fx2, {
        financialAccountId: fx2.card.id,
        amountCents: 20000,
      });
    const [one, two] = await Promise.all([
      states(fx2, ids2),
      states(fx2, [ids2[0]!, third2.id]),
    ]);
    expect(
      (
        await Promise.all([
          writeReview(fx2.ws, request(one), today),
          writeReview(fx2.ws, request(two), today),
        ])
      ).sort(),
    ).toEqual(["ok", "stale"]);
    expect(
      (await records(fx2.ws)).filter((r) => r.transferPairId),
    ).toHaveLength(2);
  });
  it("rejects stale facts, labels, timestamps, missing and foreign ids without touching balances", async () => {
    const fx = await setup(),
      ids = await pair(fx),
      expected = await states(fx, ids),
      before = await balances(fx.ws);
    await db
      .update(transaction)
      .set({ descriptionRaw: "Changed" })
      .where(eq(transaction.id, ids[0]!));
    expect(await writeReview(fx.ws, request(expected), today)).toBe("stale");
    expect(
      await writeReview(fx.ws, request([expected[0]!, expected[0]!]), today),
    ).toBe("ineligible");
    const other = await setup(),
      foreign = await pair(other);
    expect(
      await writeReview(fx.ws, request(await states(other, foreign)), today),
    ).toBe("not_found");
    expect(
      await writeReview(
        fx.ws,
        request([{ ...expected[0]!, id: crypto.randomUUID() }, expected[1]!]),
        today,
      ),
    ).toBe("not_found");
    const fresh = await states(fx, ids);
    expect(
      await writeReview(
        fx.ws,
        request([
          { ...fresh[0]!, updatedAt: "2026-10-11T00:00:00Z" },
          fresh[1]!,
        ]),
        today,
      ),
    ).toBe("stale");
    expect(await balances(fx.ws)).toEqual(before);
    expect((await records(other.ws)).every((r) => !r.isTransfer)).toBe(true);
  });
  it.each([
    { amountCents: 0 },
    { amountCents: 19999 },
    { status: "pending" as const },
    { postedOn: "2026-10-12" },
    { postedOn: "2026-10-07" },
  ])("refuses changed eligibility %j", async (extra) => {
    const fx = await setup();
    const a = await row(fx),
      b = await row(fx, {
        financialAccountId: fx.card.id,
        amountCents: 20000,
        ...extra,
      });
    const expected = await states(fx, [a.id, b.id]);
    expect(await writeReview(fx.ws, request(expected), today)).toBe(
      "ineligible",
    );
  });
  it("does not match same-account, zero, pending, future, unsafe or already paired rows", async () => {
    const fx = await setup(),
      source = await row(fx);
    for (const extra of [
      { financialAccountId: fx.cash.id },
      { amountCents: 0 },
      { status: "pending" as const },
      { postedOn: "2026-10-12" },
      { transferPairId: "legacy" },
      { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    ])
      await row(fx, {
        financialAccountId: fx.card.id,
        amountCents: 20000,
        ...extra,
      });
    expect((await read(fx, { source: source.id })).rows[0]!.candidates).toEqual(
      [],
    );
    expect(
      await writeReview(
        fx.ws,
        request(
          await states(fx, [
            source.id,
            (await row(fx, { amountCents: 20000 })).id,
          ]),
        ),
        today,
      ),
    ).toBe("ineligible");
  });
  it("loads padded and off-page counterparts, with explicit ambiguous pagination and older dates", async () => {
    const fx = await setup(),
      a = await row(fx, { postedOn: "2026-01-01" });
    const candidates = [];
    for (let i = 0; i < 22; i++)
      candidates.push(
        await row(fx, {
          financialAccountId: fx.card.id,
          amountCents: 20000,
          postedOn: "2025-12-31",
          isTransfer: i === 0,
        }),
      );
    const query = { from: "2026-01-01", to: "2026-01-01", source: a.id };
    const first = (await read(fx, query)).rows[0]!,
      second = (await read(fx, { ...query, matchPage: 2 })).rows[0]!;
    expect(first.candidateCount).toBe(22);
    expect(first.candidates).toHaveLength(20);
    expect(second.candidates).toHaveLength(2);
    expect(
      new Set([...first.candidates, ...second.candidates].map((r) => r.id))
        .size,
    ).toBe(22);
    expect(
      (await read(fx, { ...query, other: fx.cash.id })).rows[0]!.candidates,
    ).toEqual([]);
    const pageOne = await read(fx, { from: "2025-12-01", to: "2026-01-02" });
    expect(pageOne.hasMore).toBe(true);
    const pageTwo = await read(fx, {
      from: "2025-12-01",
      to: "2026-01-02",
      page: 2,
    });
    expect(
      new Set([...pageOne.rows, ...pageTwo.rows].map((r) => r.row.id)).size,
    ).toBe(23);
  });
  it("refuses truncated counterpart lists and large legacy repairs", async () => {
    const fx = await setup(),
      a = await row(fx);
    await db.insert(transaction).values(
      Array.from({ length: 2001 }, () => ({
        workspaceId: fx.ws,
        financialAccountId: fx.card.id,
        postedOn: today,
        amountCents: 20000,
        descriptionRaw: "Many",
        source: "csv" as const,
        fingerprint: crypto.randomUUID(),
      })),
    );
    const result = (await read(fx, { source: a.id })).rows[0]!;
    expect(result.matchesLimited).toBe(true);
    expect(result.candidates).toEqual([]);
    const group = await db
      .insert(transaction)
      .values(
        Array.from({ length: 51 }, () => ({
          workspaceId: fx.ws,
          financialAccountId: fx.cash.id,
          postedOn: today,
          amountCents: -1,
          descriptionRaw: "Legacy",
          source: "csv" as const,
          fingerprint: crypto.randomUUID(),
          transferPairId: "huge",
        })),
      )
      .returning();
    const legacy = (await read(fx, { source: group[0]!.id })).rows[0]!;
    expect(legacy.groupLimited).toBe(true);
    expect(
      await writeReview(
        fx.ws,
        {
          operation: "detach",
          expected: legacy.members.slice(0, 50),
          confirmed: true,
        },
        today,
      ),
    ).toBe("limit");
  });
  it("detaches explicitly, retaining each label even on invalid and orphan legacy groups", async () => {
    const fx = await setup(),
      ids = await pair(fx);
    expect(await label(fx, ids[0]!, true)).toBe("ok");
    expect(await label(fx, ids[0]!, true)).toBe("already");
    expect(
      (
        await readReview(
          fx.ws,
          reviewQuery({ view: "individual" }, today)!,
          today,
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      await writeReview(fx.ws, request(await states(fx, ids)), today),
    ).toBe("ok");
    expect(await label(fx, ids[0]!, false)).toBe("paired");
    expect(await detach(fx, ids[0]!)).toBe("ok");
    expect(
      (await records(fx.ws)).every(
        (r) => r.isTransfer && r.transferPairId === null,
      ),
    ).toBe(true);
    expect(await label(fx, ids[0]!, false)).toBe("ok");
    for (const pairId of ["", "legacy"]) {
      const legacy = await row(fx, {
        transferPairId: pairId,
        isTransfer: false,
      });
      expect((await read(fx, { source: legacy.id })).rows[0]!.pairStatus).toBe(
        "incomplete",
      );
      expect(await detach(fx, legacy.id)).toBe("ok");
      expect((await states(fx, [legacy.id]))[0]).toMatchObject({
        pairId: null,
        isTransfer: false,
      });
    }
    const group = await row(fx, { transferPairId: "bad", isTransfer: true });
    await row(fx, {
      transferPairId: "bad",
      isTransfer: false,
      amountCents: -10,
    });
    expect((await read(fx, { source: group.id })).rows[0]!.pairStatus).toBe(
      "invalid",
    );
    const stale = (await read(fx, { source: group.id })).rows[0]!.members;
    await row(fx, { transferPairId: "bad" });
    expect(
      await writeReview(
        fx.ws,
        { operation: "detach", expected: stale, confirmed: true },
        today,
      ),
    ).toBe("stale");
    expect(
      await writeReview(
        fx.ws,
        {
          operation: "detach",
          expected: await states(fx, [ids[0]!]),
          confirmed: true,
        },
        today,
      ),
    ).toBe("ineligible");
    expect(await detach(fx, group.id)).toBe("ok");
  });
  it("rolls back both label updates if the transaction fails before commit", async () => {
    const fx = await setup(),
      ids = await pair(fx),
      expected = await states(fx, ids),
      before = await records(fx.ws),
      accounts = await balances(fx.ws);
    const original = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce((callback, config) =>
      original(async (tx) => {
        await callback(tx);
        throw new Error("forced rollback after update");
      }, config),
    );
    await expect(writeReview(fx.ws, request(expected), today)).rejects.toThrow(
      "forced rollback",
    );
    expect(await records(fx.ws)).toEqual(before);
    expect(await balances(fx.ws)).toEqual(accounts);
  });
  it("guards paired edits, permits descriptions, and undoes a deleted manual leg once while keeping the survivor label", async () => {
    const fx = await setup();
    const a = await createTransaction(fx.ws, {
      description: "Repayment",
      isTransfer: false,
      ledger: {
        accountId: fx.cash.id,
        postedOn: today,
        amountCents: cents(-20000),
        status: "posted",
      },
    });
    const b = await createTransaction(fx.ws, {
      description: "Repayment",
      isTransfer: false,
      ledger: {
        accountId: fx.card.id,
        postedOn: today,
        amountCents: cents(20000),
        status: "posted",
      },
    });
    expect(
      await writeReview(fx.ws, request(await states(fx, [a!, b!])), today),
    ).toBe("ok");
    const accounts = await balances(fx.ws);
    for (const ledger of [
      {
        accountId: fx.cash.id,
        postedOn: today,
        amountCents: cents(-19999),
        status: "posted" as const,
      },
      {
        accountId: fx.cash.id,
        postedOn: "2026-10-10",
        amountCents: cents(-20000),
        status: "posted" as const,
      },
      {
        accountId: fx.card.id,
        postedOn: today,
        amountCents: cents(-20000),
        status: "posted" as const,
      },
      {
        accountId: fx.cash.id,
        postedOn: today,
        amountCents: cents(-20000),
        status: "pending" as const,
      },
    ])
      expect(
        await updateTransaction(fx.ws, a!, {
          description: "Repayment",
          isTransfer: true,
          ledger,
        }),
      ).toBe("paired");
    expect(
      await updateTransaction(fx.ws, a!, {
        description: "Edited",
        ledger: null,
        isTransfer: false,
      }),
    ).toBe("paired");
    expect(
      await updateTransaction(fx.ws, a!, {
        description: "Edited",
        ledger: null,
        isTransfer: true,
      }),
    ).toBe("updated");
    expect(await balances(fx.ws)).toEqual(accounts);
    expect(await deleteTransaction(fx.ws, a!)).toBe(true);
    expect(await deleteTransaction(fx.ws, a!)).toBe(false);
    expect((await states(fx, [b!]))[0]).toMatchObject({
      pairId: null,
      isTransfer: true,
    });
    expect(
      (await balances(fx.ws)).find((r) => r.id === fx.cash.id)
        ?.currentBalanceCents,
    ).toBe(50000);
  });
  it("leaves an account-deletion orphan for explicit detachment without auto reclassification", async () => {
    const fx = await setup(),
      ids = await pair(fx);
    await writeReview(fx.ws, request(await states(fx, ids)), today);
    await deleteAccount(fx.ws, fx.card.id);
    expect((await read(fx, { source: ids[0] })).rows[0]!.pairStatus).toBe(
      "incomplete",
    );
    expect((await states(fx, [ids[0]!]))[0]!.isTransfer).toBe(true);
    expect(await detach(fx, ids[0]!)).toBe("ok");
  });
  it("refuses Bills snapshot changes through review and the old transaction checkbox, then allows explicit unlink", async () => {
    const fx = await setup(),
      ids = await pair(fx),
      target = await bill(fx);
    expect(await linkBillPayment(fx.ws, target, today, 1, ids[0]!, now)).toBe(
      "ok",
    );
    const before = await db
      .select()
      .from(billPayment)
      .where(eq(billPayment.workspaceId, fx.ws));
    expect(await label(fx, ids[0]!, true)).toBe("allocated");
    expect(
      await writeReview(fx.ws, request(await states(fx, ids)), today),
    ).toBe("allocated");
    expect(
      await updateTransaction(fx.ws, ids[0]!, {
        description: "Repayment",
        ledger: null,
        isTransfer: true,
      }),
    ).toBe("payment evidence");
    expect(
      await db
        .select()
        .from(billPayment)
        .where(eq(billPayment.workspaceId, fx.ws)),
    ).toEqual(before);
    const c = (await readBills(fx.ws, now)).bills[0]!.cycles.find(
      (c) => c.scheduledOn === today,
    )!;
    expect(
      await unlinkBillPayment(
        fx.ws,
        target,
        today,
        c.revision,
        before[0]!.id,
        now,
      ),
    ).toBe("ok");
    expect(
      await writeReview(fx.ws, request(await states(fx, ids)), today),
    ).toBe("ok");
  });
  it("permits pairing and detaching an already-labelled debt payment without altering evidence", async () => {
    const fx = await setup(),
      ids = await pair(fx, { isTransfer: true }),
      target = await bill(fx, true);
    expect(await linkBillPayment(fx.ws, target, today, 1, ids[0]!, now)).toBe(
      "ok",
    );
    const evidence = await db
      .select()
      .from(billPayment)
      .where(eq(billPayment.workspaceId, fx.ws));
    const view = await readBills(fx.ws, now),
      accounts = await balances(fx.ws);
    expect(
      await writeReview(fx.ws, request(await states(fx, ids)), today),
    ).toBe("ok");
    expect(await detach(fx, ids[0]!)).toBe("ok");
    expect(await readBills(fx.ws, now)).toEqual(view);
    expect(
      await db
        .select()
        .from(billPayment)
        .where(eq(billPayment.workspaceId, fx.ws)),
    ).toEqual(evidence);
    expect(await balances(fx.ws)).toEqual(accounts);
    expect(await label(fx, ids[0]!, false)).toBe("allocated");
  });
  it("serializes a Bills link against classification and edit/delete against pairing", async () => {
    const fx = await setup(),
      ids = await pair(fx),
      target = await bill(fx),
      expected = await states(fx, ids);
    const [linked, paired] = await Promise.all([
      linkBillPayment(fx.ws, target, today, 1, ids[0]!, now),
      writeReview(fx.ws, request(expected), today),
    ]);
    expect([
      ["ok", "allocated"],
      ["invalid_payment", "ok"],
    ]).toContainEqual([linked, paired]);
    const evidence = await db
      .select()
      .from(billPayment)
      .where(eq(billPayment.workspaceId, fx.ws));
    expect(
      evidence.length
        ? evidence[0]!.isTransfer
        : (await states(fx, ids))[0]!.isTransfer,
    ).toBe(evidence.length === 0);
    const second = await setup(),
      next = await pair(second),
      state = await states(second, next);
    const [updated, paired2] = await Promise.all([
      updateTransaction(second.ws, next[0]!, {
        description: "Changed",
        ledger: null,
        isTransfer: false,
      }),
      writeReview(second.ws, request(state), today),
    ]);
    expect([
      ["updated", "stale"],
      ["paired", "ok"],
    ]).toContainEqual([updated, paired2]);
    const third = await setup(),
      last = await pair(third),
      before = await states(third, last);
    const [deleted, paired3] = await Promise.all([
      deleteTransaction(third.ws, last[0]!),
      writeReview(third.ws, request(before), today),
    ]);
    expect(deleted).toBe(true);
    expect(["not_found", "ok"]).toContain(paired3);
    const survivor = (await states(third, [last[1]!]))[0]!;
    expect(survivor.pairId).toBeNull();
    expect(survivor.isTransfer).toBe(paired3 === "ok");
  });
  it("never leaks foreign account names or modifies a foreign row carrying the same legacy pair id", async () => {
    const fx = await setup(),
      other = await setup();
    const a = await row(fx, { transferPairId: "shared", isTransfer: true }),
      b = await row(other, { transferPairId: "shared", isTransfer: true });
    const malformed = await row(fx, {
      financialAccountId: other.cash.id,
      descriptionRaw: "Malformed",
    });
    expect(
      (await read(fx, { source: malformed.id })).rows[0]!.row,
    ).toMatchObject({
      ownedAccount: false,
      accountName: "Account unavailable",
      accountType: null,
    });
    expect(await label(fx, malformed.id, true)).toBe("not_found");
    expect(await detach(fx, a.id)).toBe("ok");
    expect((await states(other, [b.id]))[0]!.pairId).toBe("shared");
    expect(
      (await read(fx, { account: other.cash.id })).accounts.some(
        (a) => a.id === other.cash.id,
      ),
    ).toBe(false);
  });
});
