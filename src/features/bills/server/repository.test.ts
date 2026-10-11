import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as recurring from "@/features/recurring";
import { db, pool } from "@/lib/db/client";
import {
  billCycle,
  billDetails,
  billPayment,
  category,
  financialAccount,
  organization,
  recurringSeries,
  transaction,
} from "@/lib/db/schema";
import { fixtures } from "../../../../tests/support/db-fixtures";
import {
  linkBillPayment,
  markBillPaid,
  paymentCandidates,
  readBills,
  saveBill,
  saveInvoice,
  unlinkBillPayment,
} from "./repository";

const f = fixtures();
const ON = "2026-10-11";
const NOW = new Date("2026-10-11T16:00:00Z");
const input = (accountId: string) => ({
  accountId,
  merchant: "electric",
  name: "Electric",
  kind: "bill" as const,
  amountMode: "variable" as const,
  unit: "months" as const,
  every: 1,
  amountCents: 14500,
  nextOn: ON,
  useHistory: false,
  autopay: false,
  liabilityAccountId: null,
  invoiceCents: 18400,
});
async function setup(create = true) {
  const ws = await f.newWorkspace();
  const [account] = await db
    .insert(financialAccount)
    .values({
      workspaceId: ws,
      institutionName: "Synthetic",
      nickname: "Cash",
      type: "checking",
      source: "synthetic",
      currentBalanceCents: 50000,
      balanceAsOf: ON,
    })
    .returning();
  const target = { accountId: account!.id, merchant: "electric" };
  if (create) expect(await saveBill(ws, input(target.accountId))).toBe("ok");
  return { ws, target };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function activity(
  a: Fixture,
  extra: Partial<typeof transaction.$inferInsert> = {},
) {
  const [row] = await db
    .insert(transaction)
    .values({
      workspaceId: a.ws,
      financialAccountId: a.target.accountId,
      postedOn: ON,
      amountCents: -10000,
      descriptionRaw: "Electric",
      source: "manual",
      fingerprint: crypto.randomUUID(),
      ...extra,
    })
    .returning();
  return row!;
}
const view = async (a: Fixture) =>
  (await readBills(a.ws, NOW)).bills.find(
    (b) => b.payment.merchant === a.target.merchant,
  )!;
const cycle = async (a: Fixture) =>
  (await view(a)).cycles.find((c) => c.scheduledOn === ON)!;
const snapshot = async (ws: string) => ({
  accounts: await db
    .select()
    .from(financialAccount)
    .where(eq(financialAccount.workspaceId, ws))
    .orderBy(financialAccount.id),
  activity: await db
    .select()
    .from(transaction)
    .where(eq(transaction.workspaceId, ws))
    .orderBy(transaction.id),
});
afterAll(() => f.cleanUp());

describe("Bills on PostgreSQL", () => {
  it("confirms a detected variable bill, preserves its inferred dates and requires reconfirmation after restoring", async () => {
    const a = await setup(false);
    const [utilities] = await db
      .insert(category)
      .values({
        workspaceId: a.ws,
        name: "Utilities",
        presetKey: "utilities",
        sortOrder: 1,
      })
      .returning();
    for (const [postedOn, amountCents] of [
      ["2026-07-11", -14500],
      ["2026-08-11", -18400],
      ["2026-09-11", -13000],
    ] as const)
      await activity(a, {
        postedOn,
        amountCents,
        categoryId: utilities!.id,
        categoryIsManual: true,
      });
    expect((await view(a)).payment).toMatchObject({
      decision: "candidate",
      kind: "bill",
      amountMode: "variable",
      sampleCount: 3,
    });
    expect((await view(a)).cycles).toEqual([]);
    expect(
      await recurring.confirmPattern(
        a.ws,
        a.target.accountId,
        a.target.merchant,
        NOW,
        "subscription",
      ),
    ).toBe("not_found");
    expect(
      await recurring.confirmPattern(
        a.ws,
        a.target.accountId,
        a.target.merchant,
        NOW,
        "bill",
      ),
    ).toBe("ok");
    expect((await cycle(a)).dateSource).toBe("predicted");
    expect(await markBillPaid(a.ws, a.target, ON, 0, true, NOW)).toBe("ok");
    await recurring.setPaymentDisposition(
      a.ws,
      a.target.accountId,
      a.target.merchant,
      "remove",
      NOW,
      "bill",
    );
    await recurring.setPaymentDisposition(
      a.ws,
      a.target.accountId,
      a.target.merchant,
      "restore",
      NOW,
      "bill",
    );
    expect((await view(a)).payment.decision).toBe("candidate");
    expect(
      await recurring.confirmPattern(
        a.ws,
        a.target.accountId,
        a.target.merchant,
        NOW,
        "bill",
      ),
    ).toBe("ok");
    expect(await cycle(a)).toMatchObject({
      status: "marked_paid",
      dateSource: "predicted",
    });
  });
  it("has a read-only empty state and displays confirmed recurring bills without backfilling writes", async () => {
    const a = await setup(false);
    expect((await readBills(a.ws, NOW)).bills).toEqual([]);
    await recurring.savePayment(a.ws, input(a.target.accountId));
    const bill = await view(a);
    expect(bill.detail).toBeNull();
    expect(
      bill.cycles.every(
        (c) =>
          c.id === null &&
          c.invoiceCents === null &&
          c.dateSource === "predicted",
      ),
    ).toBe(true);
    expect(
      await db
        .select()
        .from(billDetails)
        .where(eq(billDetails.workspaceId, a.ws)),
    ).toEqual([]);
  });
  it("atomically saves and edits bills while preserving invoice facts and financial activity", async () => {
    const a = await setup();
    await activity(a);
    const before = await snapshot(a.ws);
    expect(await saveBill(a.ws, input(a.target.accountId))).toBe("duplicate");
    expect(
      await saveBill(
        a.ws,
        {
          ...input(a.target.accountId),
          name: "Electricity",
          amountCents: 15000,
          autopay: true,
          nextOn: "2026-11-01",
        },
        1,
      ),
    ).toBe("ok");
    expect(await saveBill(a.ws, input(a.target.accountId), 1)).toBe("stale");
    expect(await view(a)).toMatchObject({
      payment: { name: "Electricity", amount: 15000 },
      detail: { anchorOn: ON, autopay: true, revision: 2 },
    });
    expect(await cycle(a)).toMatchObject({
      scheduledOn: ON,
      invoiceCents: 18400,
      dateSource: "user",
      estimateCents: 14500,
    });
    expect(await snapshot(a.ws)).toEqual(before);
  });
  it("rolls back the canonical schedule if the invoice insert fails", async () => {
    const a = await setup(false);
    const trigger = `bill_failure_${crypto.randomUUID().replaceAll("-", "")}`;
    const client = await pool.connect();
    try {
      await client.query(
        `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated invoice failure'; END $$`,
      );
      await client.query(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON bill_cycle FOR EACH ROW WHEN (NEW.workspace_id = '${a.ws}') EXECUTE FUNCTION ${trigger}()`,
      );
      await expect(saveBill(a.ws, input(a.target.accountId))).rejects.toThrow();
      expect(
        await db
          .select()
          .from(recurringSeries)
          .where(eq(recurringSeries.workspaceId, a.ws)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(billDetails)
          .where(eq(billDetails.workspaceId, a.ws)),
      ).toEqual([]);
    } finally {
      await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON bill_cycle`);
      await client.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
      client.release();
    }
  });
  it("keeps corrected dates on the same cycle, supports zero/unknown amounts, and clears outdated manual confirmation", async () => {
    const a = await setup();
    expect(await markBillPaid(a.ws, a.target, ON, 1, true, NOW)).toBe("ok");
    expect(await cycle(a)).toMatchObject({
      status: "marked_paid",
      revision: 2,
    });
    expect(
      await saveInvoice(
        a.ws,
        a.target,
        ON,
        2,
        { dueOn: "2026-10-25", invoiceCents: 19000 },
        NOW,
      ),
    ).toBe("ok");
    expect(await cycle(a)).toMatchObject({
      scheduledOn: ON,
      dueOn: "2026-10-25",
      markedPaid: false,
      invoiceCents: 19000,
      status: "unpaid",
    });
    await saveInvoice(
      a.ws,
      a.target,
      ON,
      3,
      { dueOn: ON, invoiceCents: 0 },
      NOW,
    );
    expect((await cycle(a)).status).toBe("no_payment_due");
    await saveInvoice(
      a.ws,
      a.target,
      ON,
      4,
      { dueOn: ON, invoiceCents: null },
      NOW,
    );
    expect(await cycle(a)).toMatchObject({
      status: "review",
      remaining: 14500,
    });
    expect(await markBillPaid(a.ws, a.target, "2026-10-12", 0, true, NOW)).toBe(
      "not_found",
    );
    expect(
      await saveInvoice(
        a.ws,
        a.target,
        ON,
        1,
        { dueOn: ON, invoiceCents: 5 },
        NOW,
      ),
    ).toBe("stale");
  });
  it("materializes a prediction only on a user write and handles the first schedule edit", async () => {
    const a = await setup(false);
    await recurring.savePayment(a.ws, input(a.target.accountId));
    expect(await saveBill(a.ws, input(a.target.accountId), 0)).toBe("ok");
    expect((await view(a)).detail?.dateSource).toBe("user");
    const b = await setup(false);
    await recurring.savePayment(b.ws, input(b.target.accountId));
    expect(
      await saveInvoice(
        b.ws,
        b.target,
        ON,
        0,
        { dueOn: "2026-10-15", invoiceCents: 18000 },
        NOW,
      ),
    ).toBe("ok");
    expect(await view(b)).toMatchObject({
      detail: { dateSource: "predicted" },
      cycles: expect.arrayContaining([
        expect.objectContaining({
          scheduledOn: ON,
          dateSource: "user",
          invoiceCents: 18000,
          revision: 2,
        }),
      ]),
    });
  });
  it("links multiple posted partial payments without changing balances and releases allocation on unlink", async () => {
    const a = await setup();
    const first = await activity(a);
    const second = await activity(a, { amountCents: -8400 });
    const before = await snapshot(a.ws);
    expect(await linkBillPayment(a.ws, a.target, ON, 1, first.id, NOW)).toBe(
      "ok",
    );
    expect(await cycle(a)).toMatchObject({
      status: "partial",
      remaining: 8400,
      revision: 2,
    });
    expect(await linkBillPayment(a.ws, a.target, ON, 2, first.id, NOW)).toBe(
      "allocated",
    );
    expect(await linkBillPayment(a.ws, a.target, ON, 2, second.id, NOW)).toBe(
      "ok",
    );
    expect(await cycle(a)).toMatchObject({
      status: "paid",
      paid: 18400,
      remaining: 0,
    });
    const paid = await cycle(a);
    expect(
      await unlinkBillPayment(
        a.ws,
        a.target,
        ON,
        paid.revision,
        paid.evidence[0]!.id,
        NOW,
      ),
    ).toBe("ok");
    expect((await cycle(a)).status).toBe("partial");
    expect(
      await unlinkBillPayment(
        a.ws,
        a.target,
        ON,
        (await cycle(a)).revision,
        crypto.randomUUID(),
        NOW,
      ),
    ).toBe("not_found");
    expect(await snapshot(a.ws)).toEqual(before);
  });
  it("rejects duplicate allocation to another cycle, concurrent stale submissions and invalid transaction kinds", async () => {
    const a = await setup();
    const row = await activity(a);
    const results = await Promise.all([
      linkBillPayment(a.ws, a.target, ON, 1, row.id, NOW),
      linkBillPayment(a.ws, a.target, ON, 1, row.id, NOW),
    ]);
    expect(results.sort()).toEqual(["ok", "stale"]);
    const earlier = {
      ...input(a.target.accountId),
      merchant: "other",
      name: "Other",
    };
    await saveBill(a.ws, earlier);
    for (const extras of [
      { status: "pending" as const },
      { amountCents: 100 },
      { amountCents: 0 },
      { descriptionRaw: "Other" },
      { postedOn: "2026-10-12" },
      { postedOn: "2026-09-11" },
      { isTransfer: true },
    ]) {
      const invalid = await activity(a, extras);
      expect(
        await linkBillPayment(a.ws, a.target, ON, 2, invalid.id, NOW),
      ).toBe("invalid_payment");
    }
    // The prior cycle's evidence window overlaps today's; allocation is global.
    await db.insert(billCycle).values({
      workspaceId: a.ws,
      billId: (await view(a)).detail!.id,
      scheduledOn: "2026-09-11",
      dueOn: "2026-09-11",
      dateSource: "user",
      estimateCents: 14500,
    });
    const overlap = await activity(a, { postedOn: "2026-10-10" });
    await linkBillPayment(a.ws, a.target, ON, 2, overlap.id, NOW);
    expect(
      await linkBillPayment(a.ws, a.target, "2026-09-11", 1, overlap.id, NOW),
    ).toBe("allocated");
  });
  it("returns changed and deleted evidence to review instead of trusting copied totals", async () => {
    const a = await setup();
    const row = await activity(a, { amountCents: -18400 });
    await linkBillPayment(a.ws, a.target, ON, 1, row.id, NOW);
    expect((await cycle(a)).status).toBe("paid");
    await db
      .update(transaction)
      .set({ amountCents: -10000 })
      .where(
        and(eq(transaction.workspaceId, a.ws), eq(transaction.id, row.id)),
      );
    expect(await cycle(a)).toMatchObject({
      status: "review",
      paid: 0,
      remaining: 18400,
    });
    await db.delete(transaction).where(eq(transaction.id, row.id));
    expect((await cycle(a)).evidence[0]).toMatchObject({
      transactionId: null,
      originalTransactionId: row.id,
      valid: false,
    });
    const [link] = await db
      .select()
      .from(billPayment)
      .where(eq(billPayment.workspaceId, a.ws));
    expect(link?.evidenceWorkspaceId).toBeNull();
  });
  it("supports explicit debt repayments as evidence while leaving transfer classifications intact", async () => {
    const a = await setup(false);
    const [card] = await db
      .insert(financialAccount)
      .values({
        workspaceId: a.ws,
        institutionName: "Synthetic",
        nickname: "Card",
        type: "credit_card",
        source: "synthetic",
      })
      .returning();
    expect(
      await saveBill(a.ws, {
        ...input(a.target.accountId),
        liabilityAccountId: card!.id,
      }),
    ).toBe("ok");
    const transfer = await activity(a, {
      isTransfer: true,
      amountCents: -18400,
    });
    expect(await linkBillPayment(a.ws, a.target, ON, 1, transfer.id, NOW)).toBe(
      "ok",
    );
    expect((await cycle(a)).status).toBe("paid");
    expect((await snapshot(a.ws)).activity[0]!.isTransfer).toBe(true);
    expect(
      await saveBill(a.ws, {
        ...input(card!.id),
        liabilityAccountId: card!.id,
      }),
    ).toBe("invalid_account");
    const [loan] = await db
      .insert(financialAccount)
      .values({
        workspaceId: a.ws,
        institutionName: "Synthetic",
        nickname: "Loan",
        type: "loan",
        source: "synthetic",
      })
      .returning();
    expect(await saveBill(a.ws, input(loan!.id))).toBe("invalid_account");
    expect(
      await saveBill(a.ws, {
        ...input(card!.id),
        liabilityAccountId: a.target.accountId,
      }),
    ).toBe("invalid_account");
  });
  it("rejects foreign accounts, liability accounts, transactions and payment evidence independently", async () => {
    const a = await setup();
    const b = await setup();
    expect(await saveBill(a.ws, input(b.target.accountId))).toBe("not_found");
    expect(
      await saveBill(
        a.ws,
        {
          ...input(a.target.accountId),
          liabilityAccountId: b.target.accountId,
        },
        1,
      ),
    ).toBe("not_found");
    const row = await activity(b);
    expect(await linkBillPayment(a.ws, a.target, ON, 1, row.id, NOW)).toBe(
      "not_found",
    );
    expect(await markBillPaid(a.ws, b.target, ON, 1, true, NOW)).toBe(
      "not_found",
    );
    expect(
      await saveBill(
        a.ws,
        { ...input(a.target.accountId), merchant: "missing" },
        0,
      ),
    ).toBe("not_found");
    expect(await readBills(crypto.randomUUID(), NOW)).toMatchObject({
      bills: [],
      accounts: [],
    });
    await expect(
      db.insert(billCycle).values({
        workspaceId: a.ws,
        billId: (await view(b)).detail!.id,
        scheduledOn: ON,
        dueOn: ON,
        dateSource: "user",
        estimateCents: 1,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(billPayment).values({
        workspaceId: a.ws,
        cycleId: (await cycle(a)).id!,
        evidenceWorkspaceId: a.ws,
        transactionId: row.id,
        originalTransactionId: row.id,
        accountId: a.target.accountId,
        amountCents: 10000,
        postedOn: ON,
        description: "Electric",
        isTransfer: false,
      }),
    ).rejects.toThrow();
  });
  it("stops/restores tracking with history intact and refuses forged non-bill lifecycle targets", async () => {
    const a = await setup();
    await recurring.setPaymentDisposition(
      a.ws,
      a.target.accountId,
      a.target.merchant,
      "remove",
      NOW,
      "bill",
    );
    expect((await view(a)).cycles).toHaveLength(1);
    expect(await markBillPaid(a.ws, a.target, ON, 1, true, NOW)).toBe(
      "not_found",
    );
    await recurring.setPaymentDisposition(
      a.ws,
      a.target.accountId,
      a.target.merchant,
      "restore",
      NOW,
      "bill",
    );
    expect((await view(a)).payment.decision).toBe("confirmed");
    await recurring.savePayment(
      a.ws,
      { ...input(a.target.accountId), kind: "subscription" },
      true,
    );
    expect(
      await recurring.setPaymentDisposition(
        a.ws,
        a.target.accountId,
        a.target.merchant,
        "remove",
        NOW,
        "bill",
      ),
    ).toBe("not_found");
    expect(await view(a)).toMatchObject({
      payment: { kind: "subscription", decision: "confirmed" },
      detail: { accountId: a.target.accountId },
    });
  });
  it("paginates payment candidates and never offers refunds or pending transactions", async () => {
    const a = await setup();
    for (let i = 0; i < 23; i++) await activity(a, { amountCents: -100 - i });
    await activity(a, { amountCents: 100 });
    await activity(a, { status: "pending" });
    const bill = await view(a);
    const current = await cycle(a);
    const first = await paymentCandidates(a.ws, bill, current, ON, 1);
    const second = await paymentCandidates(a.ws, bill, current, ON, 2);
    expect(first.rows).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(second.rows).toHaveLength(3);
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(
      23,
    );
  });
  it("reads schedules, invoices and evidence from one snapshot during concurrent writes", async () => {
    const a = await setup();
    const original = recurring.listRecurringPayments;
    const spy = vi
      .spyOn(recurring, "listRecurringPayments")
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        await db
          .update(billCycle)
          .set({ invoiceCents: 20000 })
          .where(eq(billCycle.workspaceId, a.ws));
        return result;
      });
    try {
      expect((await cycle(a)).invoiceCents).toBe(18400);
    } finally {
      spy.mockRestore();
    }
    expect((await cycle(a)).invoiceCents).toBe(20000);
  });
  it("refuses writes at the history limit atomically and fails oversized reads without partial totals", async () => {
    const a = await setup();
    const id = (await view(a)).detail!.id;
    await db.execute(
      sql`INSERT INTO bill_cycle (id,workspace_id,bill_id,scheduled_on,due_on,date_source,estimate_cents) SELECT gen_random_uuid()::text, ${a.ws}, ${id}, (DATE '2000-01-01' + n), (DATE '2000-01-01' + n), 'user', 100 FROM generate_series(0,4998) n`,
    );
    expect(
      await saveInvoice(
        a.ws,
        a.target,
        "2026-11-11",
        0,
        { dueOn: "2026-11-11", invoiceCents: 200 },
        NOW,
      ),
    ).toBe("limit");
    expect(
      await saveBill(a.ws, { ...input(a.target.accountId), merchant: "new" }),
    ).toBe("limit");
    expect(
      await db
        .select()
        .from(recurringSeries)
        .where(
          and(
            eq(recurringSeries.workspaceId, a.ws),
            eq(recurringSeries.merchant, "new"),
          ),
        ),
    ).toEqual([]);
    await db.insert(billCycle).values({
      workspaceId: a.ws,
      billId: id,
      scheduledOn: "2026-11-11",
      dueOn: "2026-11-11",
      dateSource: "user",
      estimateCents: 100,
    });
    await expect(readBills(a.ws, NOW)).rejects.toThrow("no partial totals");
  });
  it("cascades workspace deletion while preserving other workspaces", async () => {
    const a = await setup();
    const b = await setup();
    await db.delete(organization).where(eq(organization.id, a.ws));
    expect((await readBills(a.ws, NOW)).bills).toEqual([]);
    expect((await readBills(b.ws, NOW)).bills).toHaveLength(1);
  });
});
