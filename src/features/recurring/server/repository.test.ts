import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import {
  financialAccount,
  organization,
  recurringSeries,
  transaction,
} from "@/lib/db/schema";
import { fixtures } from "../../../../tests/support/db-fixtures";
import {
  confirmPattern,
  listRecurringPayments,
  listSubscriptions,
  refreshRecurringSeries,
  savePayment,
  setPaymentDisposition,
  setPaymentIntent,
} from "./repository";
import type { PaymentInput } from "../domain/forms";

const f = fixtures();
const NOW = new Date("2026-10-11T15:00:00Z");
let a: string;
let b: string;
let accountA: string;
let accountB: string;
async function account(workspaceId: string) {
  return (
    await db
      .insert(financialAccount)
      .values({
        workspaceId,
        institutionName: "Synthetic bank",
        nickname: "Everyday",
        type: "checking",
        source: "synthetic",
        currentBalanceCents: 50000,
      })
      .returning()
  )[0]!.id;
}
const name = () => `service ${crypto.randomUUID()}`;
async function charges(
  merchant: string,
  ws = a,
  acct = accountA,
  amounts = [-1599, -1599, -1599],
) {
  const values = amounts.map((amountCents, i) => ({
    workspaceId: ws,
    financialAccountId: acct,
    amountCents,
    postedOn: `2026-${String(i + 8).padStart(2, "0")}-01`,
    descriptionRaw: merchant,
    source: "csv" as const,
    fingerprint: crypto.randomUUID(),
  }));
  return db.insert(transaction).values(values).returning();
}
const input = (merchant: string, accountId = accountA): PaymentInput => ({
  accountId,
  merchant,
  name: "Manual bill",
  kind: "bill",
  amountMode: "variable",
  unit: "months",
  every: 1,
  amountCents: 11000,
  nextOn: "2026-11-01",
  useHistory: true,
});
const row = async (workspaceId: string, merchant: string) =>
  (
    await db
      .select()
      .from(recurringSeries)
      .where(
        and(
          eq(recurringSeries.workspaceId, workspaceId),
          eq(recurringSeries.merchant, merchant),
        ),
      )
  )[0];
beforeAll(async () => {
  a = await f.newWorkspace();
  b = await f.newWorkspace();
  accountA = await account(a);
  accountB = await account(b);
});
afterAll(() => f.cleanUp());

describe("recurring persistence with real PostgreSQL", () => {
  it("uses all history pages instead of the transactions screen's capped list", async () => {
    const ws = await f.newWorkspace();
    const acct = await account(ws);
    const merchant = name();
    await charges(merchant, ws, acct);
    await db.insert(transaction).values(
      Array.from({ length: 505 }, (_, i) => ({
        workspaceId: ws,
        financialAccountId: acct,
        postedOn: "2026-10-01",
        amountCents: -100,
        descriptionRaw: `unrelated ${i}`,
        source: "csv" as const,
        fingerprint: crypto.randomUUID(),
      })),
    );
    expect(
      (await listRecurringPayments(ws, NOW)).payments.map(
        (payment) => payment.merchant,
      ),
    ).toEqual([merchant]);
    await confirmPattern(ws, acct, merchant, NOW);
    expect((await listRecurringPayments(ws, NOW)).summary.actual).toBe(1599);
  });
  it("fails safely instead of computing from truncated history beyond its bound", async () => {
    const ws = await f.newWorkspace();
    const acct = await account(ws);
    await db.execute(
      sql`INSERT INTO "transaction" (id, workspace_id, financial_account_id, posted_on, amount_cents, description_raw, source, fingerprint) SELECT gen_random_uuid()::text, ${ws}, ${acct}, '2026-10-01', -100, 'too much history', 'csv', n::text FROM generate_series(1,20001) n`,
    );
    await expect(listRecurringPayments(ws, NOW)).rejects.toThrow(
      "history limit exceeded",
    );
    await expect(refreshRecurringSeries(ws, undefined, NOW)).rejects.toThrow(
      "history limit exceeded",
    );
    expect(await row(ws, "too much history")).toBeUndefined();
  }, 15_000);
  it("derives new suggestions on a read without writing anything", async () => {
    const merchant = name();
    await charges(merchant);
    const before = await db
      .select()
      .from(recurringSeries)
      .where(eq(recurringSeries.workspaceId, a));
    const view = await listRecurringPayments(a, NOW);
    expect(
      view.payments.find((payment) => payment.merchant === merchant)?.decision,
    ).toBe("candidate");
    expect(
      await db
        .select()
        .from(recurringSeries)
        .where(eq(recurringSeries.workspaceId, a)),
    ).toEqual(before);
  });
  it("materializes suggestions idempotently and never changes ledger facts", async () => {
    const merchant = name();
    const history = await charges(merchant);
    const balance = (
      await db
        .select()
        .from(financialAccount)
        .where(eq(financialAccount.id, accountA))
    )[0];
    await Promise.all([
      refreshRecurringSeries(a, [accountA], NOW),
      refreshRecurringSeries(a, [accountA], NOW),
    ]);
    expect((await row(a, merchant))?.decision).toBe("candidate");
    expect(
      await db
        .select()
        .from(recurringSeries)
        .where(
          and(
            eq(recurringSeries.workspaceId, a),
            eq(recurringSeries.merchant, merchant),
          ),
        ),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(transaction)
        .where(eq(transaction.financialAccountId, accountA))
        .then((rows) =>
          rows.filter((item) =>
            history.some((original) => original.id === item.id),
          ),
        ),
    ).toEqual(history);
    expect(
      (
        await db
          .select()
          .from(financialAccount)
          .where(eq(financialAccount.id, accountA))
      )[0],
    ).toEqual(balance);
  });
  it("confirms a fresh pattern and preserves cancellation intent on refresh", async () => {
    const merchant = name();
    await charges(merchant);
    expect(await confirmPattern(a, accountA, merchant, NOW)).toBe("ok");
    expect(await setPaymentIntent(a, accountA, merchant, "cancel")).toBe("ok");
    await Promise.all([
      refreshRecurringSeries(a, [accountA], NOW),
      setPaymentIntent(a, accountA, merchant, "keep"),
    ]);
    expect(await row(a, merchant)).toMatchObject({
      decision: "confirmed",
      userIntent: "keep",
      baselineAmountCents: 1599,
    });
    expect(
      (await listSubscriptions(a, NOW)).some(
        (payment) => payment.merchant === merchant,
      ),
    ).toBe(true);
  });
  it("confirms an already materialized suggestion without duplication", async () => {
    const merchant = name();
    await charges(merchant);
    await refreshRecurringSeries(a, [accountA], NOW);
    await Promise.all([
      confirmPattern(a, accountA, merchant, NOW),
      confirmPattern(a, accountA, merchant, NOW),
    ]);
    expect(await row(a, merchant)).toMatchObject({ decision: "confirmed" });
    expect(
      await db
        .select()
        .from(recurringSeries)
        .where(eq(recurringSeries.merchant, merchant)),
    ).toHaveLength(1);
  });
  it("supports manual bills before history and prevents same-payee duplication", async () => {
    const merchant = name();
    expect(await savePayment(a, input(merchant))).toBe("ok");
    expect(await savePayment(a, input(merchant))).toBe("duplicate");
    expect(await setPaymentIntent(a, accountA, merchant, "cancel")).toBe(
      "not_subscription",
    );
    expect(
      (await listRecurringPayments(a, NOW)).payments.find(
        (payment) => payment.merchant === merchant,
      ),
    ).toMatchObject({
      manual: true,
      kind: "bill",
      amount: 11000,
      sampleCount: 0,
    });
  });
  it("keeps corrected kind, estimate and schedule after later imports", async () => {
    const merchant = name();
    await charges(merchant, a, accountA, [-9500, -13000, -11000]);
    await confirmPattern(a, accountA, merchant, NOW);
    expect(
      await savePayment(
        a,
        { ...input(merchant), useHistory: false, amountCents: 12000, every: 2 },
        true,
      ),
    ).toBe("ok");
    await refreshRecurringSeries(a, undefined, NOW);
    expect(await row(a, merchant)).toMatchObject({
      kind: "bill",
      manual: true,
      amountCents: 12000,
      every: 2,
    });
    expect(
      (await listRecurringPayments(a, NOW)).payments.find(
        (payment) => payment.merchant === merchant,
      )?.amount,
    ).toBe(12000);
  });
  it("updates a variable estimate from later actual charges when requested", async () => {
    const merchant = name();
    await charges(merchant, a, accountA, [-9500, -13000, -11000]);
    await savePayment(a, input(merchant));
    expect(
      (await listRecurringPayments(a, NOW)).payments.find(
        (payment) => payment.merchant === merchant,
      )?.amount,
    ).toBe(11000);
    await db.insert(transaction).values({
      workspaceId: a,
      financialAccountId: accountA,
      postedOn: "2026-11-01",
      amountCents: -14000,
      descriptionRaw: merchant,
      source: "pdf",
      fingerprint: crypto.randomUUID(),
    });
    const view = await listRecurringPayments(
      a,
      new Date("2026-11-02T15:00:00Z"),
    );
    expect(
      view.payments.find((payment) => payment.merchant === merchant),
    ).toMatchObject({
      amount: 13000,
      priceChanged: false,
      nextOn: "2026-12-01",
    });
  });
  it("dismisses a dynamic suggestion and preserves suppression on refresh", async () => {
    const merchant = name();
    await charges(merchant);
    expect(
      await setPaymentDisposition(a, accountA, merchant, "dismiss", NOW),
    ).toBe("ok");
    await refreshRecurringSeries(a, undefined, NOW);
    expect(await row(a, merchant)).toMatchObject({ decision: "dismissed" });
    expect(
      await setPaymentDisposition(a, accountA, merchant, "restore", NOW),
    ).toBe("ok");
    expect(await row(a, merchant)).toMatchObject({ decision: "candidate" });
    await confirmPattern(a, accountA, merchant, NOW);
  });
  it("removes and restores manual tracking without deleting transactions", async () => {
    const merchant = name();
    const history = await charges(merchant);
    await savePayment(a, input(merchant));
    await setPaymentDisposition(a, accountA, merchant, "remove", NOW);
    expect(await row(a, merchant)).toMatchObject({
      decision: "dismissed",
      manual: true,
    });
    await refreshRecurringSeries(a, undefined, NOW);
    await setPaymentDisposition(a, accountA, merchant, "restore", NOW);
    expect(await row(a, merchant)).toMatchObject({ decision: "confirmed" });
    expect(
      (
        await db
          .select()
          .from(transaction)
          .where(eq(transaction.descriptionRaw, merchant))
      ).map((item) => item.id),
    ).toEqual(history.map((item) => item.id));
  });
  it("keeps choices but excludes a detected series after evidence is deleted", async () => {
    const merchant = name();
    await charges(merchant);
    await confirmPattern(a, accountA, merchant, NOW);
    await db
      .delete(transaction)
      .where(
        and(
          eq(transaction.workspaceId, a),
          eq(transaction.descriptionRaw, merchant),
        ),
      );
    const payment = (await listRecurringPayments(a, NOW)).payments.find(
      (item) => item.merchant === merchant,
    );
    expect(payment).toMatchObject({ decision: "confirmed", active: false });
  });
  it("checks workspace/account ownership at both repository and SQL boundaries", async () => {
    const merchant = name();
    await charges(merchant, b, accountB);
    await confirmPattern(b, accountB, merchant, NOW);
    const before = await row(b, merchant);
    expect(await savePayment(a, input(merchant, accountB))).toBe("not_found");
    expect(await confirmPattern(a, accountB, merchant, NOW)).toBe("not_found");
    expect(await setPaymentIntent(a, accountB, merchant, "keep")).toBe(
      "not_found",
    );
    expect(
      await setPaymentDisposition(a, accountB, merchant, "dismiss", NOW),
    ).toBe("not_found");
    expect(await row(b, merchant)).toEqual(before);
    await expect(
      db.insert(recurringSeries).values({
        workspaceId: a,
        accountId: accountB,
        merchant: name(),
        name: "Wrong workspace",
        kind: "bill",
        amountMode: "variable",
        unit: "months",
        every: 1,
        baselineAmountCents: 100,
      }),
    ).rejects.toThrow();
    expect(
      (await listRecurringPayments(a, NOW)).payments.every(
        (payment) => payment.accountId === accountA,
      ),
    ).toBe(true);
  });
  it("refuses unsupported/missing objects and empty refresh targets safely", async () => {
    const merchant = name();
    expect(await confirmPattern(a, accountA, merchant, NOW)).toBe("not_found");
    expect(await savePayment(a, input(merchant), true)).toBe("not_found");
    expect(
      await setPaymentDisposition(a, accountA, merchant, "restore", NOW),
    ).toBe("not_found");
    expect(
      await setPaymentDisposition(a, accountA, merchant, "remove", NOW),
    ).toBe("not_found");
    expect(await refreshRecurringSeries(a, [], NOW)).toBe("ok");
    await expect(refreshRecurringSeries(a, ["bad"], NOW)).rejects.toThrow();
  });
  it("rolls back the entire refresh when a later insert fails", async () => {
    const ws = await f.newWorkspace();
    const acct = await account(ws);
    await charges("rollback alpha", ws, acct);
    await charges("rollback beta", ws, acct);
    const constraint = `test_recurring_${crypto.randomUUID().replaceAll("-", "")}`;
    await db.execute(
      sql.raw(
        `ALTER TABLE recurring_series ADD CONSTRAINT ${constraint} CHECK (workspace_id <> '${ws}' OR merchant_normalized <> 'rollback beta')`,
      ),
    );
    try {
      await expect(
        refreshRecurringSeries(ws, undefined, NOW),
      ).rejects.toThrow();
      expect(
        await db
          .select()
          .from(recurringSeries)
          .where(eq(recurringSeries.workspaceId, ws)),
      ).toEqual([]);
    } finally {
      await db.execute(
        sql.raw(`ALTER TABLE recurring_series DROP CONSTRAINT ${constraint}`),
      );
    }
  });
  it("fails the series limit before writes and still allows an existing correction", async () => {
    const ws = await f.newWorkspace();
    const acct = await account(ws);
    await db.insert(recurringSeries).values(
      Array.from({ length: 1000 }, (_, i) => ({
        workspaceId: ws,
        accountId: acct,
        merchant: `saved ${i}`,
        name: `Saved ${i}`,
        kind: "bill" as const,
        amountMode: "fixed" as const,
        unit: "months" as const,
        every: 1,
        baselineAmountCents: 100,
      })),
    );
    await charges("new series", ws, acct);
    expect(await refreshRecurringSeries(ws, undefined, NOW)).toBe("limit");
    expect(await confirmPattern(ws, acct, "new series", NOW)).toBe("limit");
    expect(await savePayment(ws, input("new manual", acct))).toBe("limit");
    expect(
      await setPaymentDisposition(ws, acct, "new series", "dismiss", NOW),
    ).toBe("limit");
    expect(await savePayment(ws, input("saved 0", acct), true)).toBe("ok");
    expect(await row(ws, "new series")).toBeUndefined();
  });
  it("cascades account/workspace deletion to recurring preferences", async () => {
    const ws = await f.newWorkspace();
    const acct = await account(ws);
    const merchant = name();
    await savePayment(ws, input(merchant, acct));
    await db.delete(financialAccount).where(eq(financialAccount.id, acct));
    expect(await row(ws, merchant)).toBeUndefined();
    const another = await account(ws);
    await savePayment(ws, input(merchant, another));
    await db.delete(organization).where(eq(organization.id, ws));
    expect(await row(ws, merchant)).toBeUndefined();
  });
  it("suggests, confirms and keeps a payday from deposits into checking (ADR-060)", async () => {
    const merchant = name();
    await charges(merchant, a, accountA, [145000, 145000, 145000]);

    const suggested = (await listRecurringPayments(a, NOW)).payments.find(
      (payment) => payment.merchant === merchant,
    );
    expect(suggested).toMatchObject({
      kind: "income",
      decision: "candidate",
      nextOn: "2026-11-01",
    });

    expect(await confirmPattern(a, accountA, merchant, NOW)).toBe("ok");
    expect(await row(a, merchant)).toMatchObject({
      kind: "income",
      decision: "confirmed",
      baselineAmountCents: 145000,
    });
    expect(await setPaymentIntent(a, accountA, merchant, "cancel")).toBe(
      "not_subscription",
    );
    const { summary } = await listRecurringPayments(a, NOW);
    expect(summary.income).toBeGreaterThanOrEqual(145000);
    expect(
      (await listSubscriptions(a, NOW)).some(
        (payment) => payment.merchant === merchant,
      ),
    ).toBe(false);
  });
  it("saves a payday entered by hand", async () => {
    const merchant = name();

    expect(
      await savePayment(a, {
        ...input(merchant),
        name: "Pay",
        kind: "income",
        amountMode: "fixed",
        unit: "days",
        every: 14,
        amountCents: 145000,
      }),
    ).toBe("ok");
    expect(await row(a, merchant)).toMatchObject({
      kind: "income",
      decision: "confirmed",
      manual: true,
      userIntent: "none",
    });
  });
});
