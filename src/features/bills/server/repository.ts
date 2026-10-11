import "server-only";
import { and, asc, count, desc, eq, gt, lt, lte, sql } from "drizzle-orm";
import {
  listRecurringPayments,
  savePaymentInTransaction,
} from "@/features/recurring";
import {
  dateSchema,
  paymentInputSchema,
  type Payment,
} from "@/features/recurring/client";
import { db } from "@/lib/db/client";
import {
  billCycle,
  billDetails,
  billPayment,
  financialAccount,
  recurringSeries,
  transaction,
} from "@/lib/db/schema";
import { absolute, cents } from "@/lib/money";
import {
  cycleOffset,
  cycleState,
  paymentEligible,
  projectedCycles,
  scheduledDate,
  type CycleFact,
  type PostedFact,
  type Schedule,
} from "../domain/cycles";
import {
  billInputSchema,
  invoiceInputSchema,
  revisionSchema,
  targetSchema,
  type BillInput,
  type InvoiceInput,
} from "../domain/forms";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Detail = typeof billDetails.$inferSelect;
type StoredCycle = typeof billCycle.$inferSelect;
export type Target = { accountId: string; merchant: string };
export type WriteResult =
  | "ok"
  | "not_found"
  | "duplicate"
  | "stale"
  | "invalid_payment"
  | "allocated"
  | "invalid_account"
  | "limit";
const key = (accountId: string, merchant: string) =>
  JSON.stringify([accountId, merchant]);
const owned = (workspaceId: string, target: Target) =>
  and(
    eq(billDetails.workspaceId, workspaceId),
    eq(billDetails.accountId, target.accountId),
    eq(billDetails.merchant, target.merchant),
  );
class Refused extends Error {
  constructor(readonly result: WriteResult) {
    super(result);
  }
}
async function locked(
  workspaceId: string,
  operation: (tx: Tx) => Promise<WriteResult>,
): Promise<WriteResult> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId}, 53))`,
      );
      const result = await operation(tx);
      if (result !== "ok") throw new Refused(result);
      return result;
    });
  } catch (error) {
    if (error instanceof Refused) return error.result;
    throw error;
  }
}
const postedFact = (row: typeof transaction.$inferSelect): PostedFact => ({
  id: row.id,
  accountId: row.financialAccountId,
  amountCents: row.amountCents,
  postedOn: row.postedOn,
  description: row.descriptionRaw,
  status: row.status,
  isTransfer: row.isTransfer,
});
async function cycleCapacity(tx: Tx, workspaceId: string) {
  const [row] = await tx
    .select({ total: count() })
    .from(billCycle)
    .where(eq(billCycle.workspaceId, workspaceId));
  if (row!.total >= 5000) throw new Refused("limit");
}

/** Caller verifies workspace access; all facts use one read-only snapshot. */
export async function readBills(workspaceId: string, now = new Date()) {
  return db.transaction(
    async (tx) => {
      const recurring = await listRecurringPayments(workspaceId, now, tx);
      const accounts = await tx
        .select()
        .from(financialAccount)
        .where(eq(financialAccount.workspaceId, workspaceId))
        .orderBy(asc(financialAccount.nickname))
        .limit(1001);
      const details = await tx
        .select()
        .from(billDetails)
        .where(eq(billDetails.workspaceId, workspaceId))
        .limit(1001);
      const cycles = await tx
        .select()
        .from(billCycle)
        .where(eq(billCycle.workspaceId, workspaceId))
        .orderBy(asc(billCycle.id))
        .limit(5001);
      const evidence = await tx
        .select({ link: billPayment, row: transaction })
        .from(billPayment)
        .leftJoin(
          transaction,
          and(
            eq(transaction.id, billPayment.transactionId),
            eq(transaction.workspaceId, workspaceId),
            eq(transaction.workspaceId, billPayment.evidenceWorkspaceId),
          ),
        )
        .where(eq(billPayment.workspaceId, workspaceId))
        .limit(10001);
      if (
        accounts.length > 1000 ||
        details.length > 1000 ||
        cycles.length > 5000 ||
        evidence.length > 10000
      )
        throw new Error(
          "Bills history limit exceeded; no partial totals returned",
        );
      const detailsByKey = new Map(
        details.map((d) => [key(d.accountId, d.merchant), d]),
      );
      const cyclesByBill = new Map<string, StoredCycle[]>();
      for (const cycle of cycles) {
        const list = cyclesByBill.get(cycle.billId) ?? [];
        list.push(cycle);
        cyclesByBill.set(cycle.billId, list);
      }
      const evidenceByCycle = new Map<
        string,
        (typeof billPayment.$inferSelect)[]
      >();
      const posted = new Map<string, PostedFact>();
      for (const { link, row } of evidence) {
        const list = evidenceByCycle.get(link.cycleId) ?? [];
        list.push(link);
        evidenceByCycle.set(link.cycleId, list);
        if (row) posted.set(row.id, postedFact(row));
      }
      const bills = recurring.payments
        .filter(
          (p) =>
            p.kind === "bill" || detailsByKey.has(key(p.accountId, p.merchant)),
        )
        .map((payment) => {
          const detail =
            detailsByKey.get(key(payment.accountId, payment.merchant)) ?? null;
          const facts = detail ? (cyclesByBill.get(detail.id) ?? []) : [];
          return {
            payment,
            detail,
            cycles: projectedCycles(
              payment,
              detail,
              facts,
              recurring.today,
            ).map((cycle) =>
              cycleState(
                cycle,
                cycle.id ? (evidenceByCycle.get(cycle.id) ?? []) : [],
                posted,
                recurring.today,
              ),
            ),
          };
        });
      return { today: recurring.today, accounts, bills };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type BillRecord = Awaited<ReturnType<typeof readBills>>["bills"][number];

export async function saveBill(
  workspaceId: string,
  input: BillInput,
  expectedRevision: number | null = null,
): Promise<WriteResult> {
  billInputSchema.parse(input);
  if (expectedRevision !== null) revisionSchema.parse(expectedRevision);
  return locked(workspaceId, async (tx) => {
    const [account] = await tx
      .select()
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.workspaceId, workspaceId),
          eq(financialAccount.id, input.accountId),
        ),
      );
    if (!account) return "not_found";
    if (account.type === "loan") return "invalid_account";
    if (input.liabilityAccountId) {
      const [liability] = await tx
        .select()
        .from(financialAccount)
        .where(
          and(
            eq(financialAccount.workspaceId, workspaceId),
            eq(financialAccount.id, input.liabilityAccountId),
          ),
        );
      if (!liability) return "not_found";
      if (
        !["checking", "savings"].includes(account.type) ||
        !["credit_card", "loan"].includes(liability.type)
      )
        return "invalid_account";
    }
    const [detail] = await tx
      .select()
      .from(billDetails)
      .where(owned(workspaceId, input));
    const editing = expectedRevision !== null;
    if (!editing && detail) return "duplicate";
    if (editing && (detail?.revision ?? 0) !== expectedRevision) return "stale";
    if (editing) {
      const [series] = await tx
        .select()
        .from(recurringSeries)
        .where(
          and(
            eq(recurringSeries.workspaceId, workspaceId),
            eq(recurringSeries.accountId, input.accountId),
            eq(recurringSeries.merchant, input.merchant),
          ),
        );
      if (!series || series.kind !== "bill" || series.decision !== "confirmed")
        return "not_found";
    }
    const schedule = paymentInputSchema.parse({
      ...input,
      nextOn: detail?.anchorOn ?? input.nextOn,
    });
    const result = await savePaymentInTransaction(
      tx,
      workspaceId,
      schedule,
      editing,
    );
    if (result !== "ok")
      return result === "not_subscription" ? "not_found" : result;
    if (detail) {
      await tx
        .update(billDetails)
        .set({
          autopay: input.autopay,
          liabilityAccountId: input.liabilityAccountId,
          revision: detail.revision + 1,
        })
        .where(owned(workspaceId, input));
    } else {
      await cycleCapacity(tx, workspaceId);
      const [created] = await tx
        .insert(billDetails)
        .values({
          workspaceId,
          accountId: input.accountId,
          merchant: input.merchant,
          anchorOn: input.nextOn,
          dateSource: "user",
          autopay: input.autopay,
          liabilityAccountId: input.liabilityAccountId,
        })
        .returning();
      await tx.insert(billCycle).values({
        workspaceId,
        billId: created!.id,
        scheduledOn: input.nextOn,
        dueOn: input.nextOn,
        dateSource: "user",
        invoiceCents: input.invoiceCents,
        estimateCents: input.amountCents,
      });
    }
    return "ok";
  });
}

type Context = {
  payment: Payment;
  detail: Detail | null;
  cycle: StoredCycle | null;
  fact: CycleFact;
  schedule: Schedule;
  today: string;
};
async function context(
  tx: Tx,
  workspaceId: string,
  target: Target,
  on: string,
  revision: number,
  now: Date,
): Promise<Context> {
  targetSchema.parse(target);
  dateSchema.parse(on);
  revisionSchema.parse(revision);
  const recurring = await listRecurringPayments(workspaceId, now, tx);
  const payment = recurring.payments.find(
    (p) =>
      p.accountId === target.accountId &&
      p.merchant === target.merchant &&
      p.kind === "bill" &&
      p.decision === "confirmed",
  );
  if (!payment) throw new Refused("not_found");
  const [detail] = await tx
    .select()
    .from(billDetails)
    .where(owned(workspaceId, target));
  const [cycle] = detail
    ? await tx
        .select()
        .from(billCycle)
        .where(
          and(
            eq(billCycle.workspaceId, workspaceId),
            eq(billCycle.billId, detail.id),
            eq(billCycle.scheduledOn, on),
          ),
        )
    : [];
  if ((cycle?.revision ?? 0) !== revision) throw new Refused("stale");
  const fact =
    cycle ??
    projectedCycles(payment, detail ?? null, [], recurring.today).find(
      (c) => c.scheduledOn === on,
    );
  if (!fact) throw new Refused("not_found");
  return {
    payment,
    detail: detail ?? null,
    cycle: cycle ?? null,
    fact,
    schedule: {
      anchorOn: detail?.anchorOn ?? payment.nextOn!,
      unit: payment.unit,
      every: payment.every,
    },
    today: recurring.today,
  };
}
async function materialize(
  tx: Tx,
  workspaceId: string,
  c: Context,
): Promise<StoredCycle> {
  if (c.cycle) return c.cycle;
  await cycleCapacity(tx, workspaceId);
  let detail = c.detail;
  if (!detail) {
    const [created] = await tx
      .insert(billDetails)
      .values({
        workspaceId,
        accountId: c.payment.accountId,
        merchant: c.payment.merchant,
        anchorOn: c.schedule.anchorOn,
        dateSource: "predicted",
      })
      .returning();
    detail = created!;
  }
  const [cycle] = await tx
    .insert(billCycle)
    .values({
      scheduledOn: c.fact.scheduledOn,
      dueOn: c.fact.dueOn,
      dateSource: c.fact.dateSource,
      invoiceCents: c.fact.invoiceCents,
      estimateCents: c.fact.estimateCents,
      markedPaid: c.fact.markedPaid,
      workspaceId,
      billId: detail.id,
    })
    .returning();
  return cycle!;
}
async function touch(
  tx: Tx,
  workspaceId: string,
  cycle: StoredCycle,
  values: Partial<
    Pick<StoredCycle, "dueOn" | "dateSource" | "invoiceCents" | "markedPaid">
  > = {},
) {
  await tx
    .update(billCycle)
    .set({ ...values, revision: cycle.revision + 1 })
    .where(
      and(eq(billCycle.workspaceId, workspaceId), eq(billCycle.id, cycle.id)),
    );
}
export async function saveInvoice(
  workspaceId: string,
  target: Target,
  on: string,
  revision: number,
  input: InvoiceInput,
  now = new Date(),
): Promise<WriteResult> {
  invoiceInputSchema.parse(input);
  return locked(workspaceId, async (tx) => {
    const c = await context(tx, workspaceId, target, on, revision, now);
    const cycle = await materialize(tx, workspaceId, c);
    await touch(tx, workspaceId, cycle, {
      ...input,
      dateSource: "user",
      markedPaid:
        input.dueOn === cycle.dueOn && input.invoiceCents === cycle.invoiceCents
          ? cycle.markedPaid
          : false,
    });
    return "ok";
  });
}
export async function markBillPaid(
  workspaceId: string,
  target: Target,
  on: string,
  revision: number,
  markedPaid: boolean,
  now = new Date(),
): Promise<WriteResult> {
  return locked(workspaceId, async (tx) => {
    const c = await context(tx, workspaceId, target, on, revision, now);
    await touch(tx, workspaceId, await materialize(tx, workspaceId, c), {
      markedPaid,
    });
    return "ok";
  });
}
export async function linkBillPayment(
  workspaceId: string,
  target: Target,
  on: string,
  revision: number,
  transactionId: string,
  now = new Date(),
): Promise<WriteResult> {
  return locked(workspaceId, async (tx) => {
    const c = await context(tx, workspaceId, target, on, revision, now);
    const [row] = await tx
      .select()
      .from(transaction)
      .where(
        and(
          eq(transaction.workspaceId, workspaceId),
          eq(transaction.id, transactionId),
        ),
      );
    if (!row) return "not_found";
    if (
      !paymentEligible(
        c.payment,
        postedFact(row),
        c.schedule,
        on,
        c.today,
        Boolean(c.detail?.liabilityAccountId),
      )
    )
      return "invalid_payment";
    const [allocated] = await tx
      .select()
      .from(billPayment)
      .where(
        and(
          eq(billPayment.workspaceId, workspaceId),
          eq(billPayment.originalTransactionId, transactionId),
        ),
      );
    if (allocated) return "allocated";
    const [size] = await tx
      .select({ total: count() })
      .from(billPayment)
      .where(eq(billPayment.workspaceId, workspaceId));
    if (size!.total >= 10000) return "limit";
    const cycle = await materialize(tx, workspaceId, c);
    await tx.insert(billPayment).values({
      workspaceId,
      cycleId: cycle.id,
      evidenceWorkspaceId: workspaceId,
      transactionId,
      originalTransactionId: transactionId,
      accountId: row.financialAccountId,
      amountCents: absolute(cents(row.amountCents)),
      postedOn: row.postedOn,
      description: row.descriptionRaw,
      isTransfer: row.isTransfer,
    });
    await touch(tx, workspaceId, cycle);
    return "ok";
  });
}
export async function unlinkBillPayment(
  workspaceId: string,
  target: Target,
  on: string,
  revision: number,
  paymentId: string,
  now = new Date(),
): Promise<WriteResult> {
  return locked(workspaceId, async (tx) => {
    const c = await context(tx, workspaceId, target, on, revision, now);
    if (!c.cycle) return "not_found";
    const rows = await tx
      .delete(billPayment)
      .where(
        and(
          eq(billPayment.workspaceId, workspaceId),
          eq(billPayment.cycleId, c.cycle.id),
          eq(billPayment.id, paymentId),
        ),
      )
      .returning({ id: billPayment.id });
    if (!rows.length) return "not_found";
    await touch(tx, workspaceId, c.cycle);
    return "ok";
  });
}

export async function paymentCandidates(
  workspaceId: string,
  bill: BillRecord,
  cycle: CycleFact,
  today: string,
  page: number,
) {
  const schedule: Schedule = {
    anchorOn: bill.detail?.anchorOn ?? bill.payment.nextOn ?? cycle.scheduledOn,
    unit: bill.payment.unit,
    every: bill.payment.every,
  };
  const offset = cycleOffset(schedule, cycle.scheduledOn);
  const rows = await db
    .select()
    .from(transaction)
    .where(
      and(
        eq(transaction.workspaceId, workspaceId),
        eq(transaction.financialAccountId, bill.payment.accountId),
        eq(transaction.status, "posted"),
        lt(transaction.amountCents, 0),
        lte(transaction.postedOn, today),
        gt(transaction.postedOn, scheduledDate(schedule, offset - 1)),
        lt(transaction.postedOn, scheduledDate(schedule, offset + 1)),
        bill.detail?.liabilityAccountId
          ? undefined
          : eq(transaction.isTransfer, false),
      ),
    )
    .orderBy(desc(transaction.postedOn), desc(transaction.id))
    .limit(21)
    .offset((page - 1) * 20);
  return {
    rows: rows
      .slice(0, 20)
      .map(postedFact)
      .filter((row) =>
        paymentEligible(
          bill.payment,
          row,
          schedule,
          cycle.scheduledOn,
          today,
          Boolean(bill.detail?.liabilityAccountId),
        ),
      ),
    hasMore: rows.length > 20,
  };
}
