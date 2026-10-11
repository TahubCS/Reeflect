import "server-only";
import { and, asc, eq, gt, gte, lte, sql } from "drizzle-orm";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { db } from "@/lib/db/client";
import {
  category,
  financialAccount,
  recurringSeries,
  transaction,
} from "@/lib/db/schema";
import { uuidv7 } from "@/lib/db/id";
import { shiftDays } from "../domain/dates";
import {
  dispositionSchema,
  intentSchema,
  paymentInputSchema,
  targetSchema,
  type PaymentInput,
} from "../domain/forms";
import {
  buildPayments,
  summarizePayments,
  type SavedPayment,
} from "../domain/payments";
import {
  HISTORY_DAYS,
  MAX_CHARGES,
  findPatterns,
  type Charge,
} from "../domain/patterns";

type Executor = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete" | "execute"
>;
export type WriteResult =
  "ok" | "not_found" | "limit" | "duplicate" | "not_subscription";
export const MAX_SERIES = 1000;
const todayIn = (now: Date) => isoDateIn(now, DEFAULT_TIME_ZONE);
const owned = (workspaceId: string, accountId: string, merchant: string) =>
  and(
    eq(recurringSeries.workspaceId, workspaceId),
    eq(recurringSeries.accountId, accountId),
    eq(recurringSeries.merchant, merchant),
  );

async function ledger(
  executor: Executor,
  workspaceId: string,
  today: string,
): Promise<Charge[]> {
  const result: Charge[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await executor
      .select({
        id: transaction.id,
        accountId: transaction.financialAccountId,
        postedOn: transaction.postedOn,
        descriptionRaw: transaction.descriptionRaw,
        amountCents: transaction.amountCents,
        status: transaction.status,
        isTransfer: transaction.isTransfer,
        categoryKey: category.presetKey,
        source: transaction.source,
        accountType: financialAccount.type,
      })
      .from(transaction)
      .innerJoin(
        financialAccount,
        and(
          eq(transaction.financialAccountId, financialAccount.id),
          eq(transaction.workspaceId, financialAccount.workspaceId),
        ),
      )
      .leftJoin(
        category,
        and(
          eq(transaction.categoryId, category.id),
          eq(transaction.workspaceId, category.workspaceId),
        ),
      )
      .where(
        and(
          eq(transaction.workspaceId, workspaceId),
          eq(transaction.status, "posted"),
          eq(transaction.isTransfer, false),
          gte(transaction.postedOn, shiftDays(today, -HISTORY_DAYS)),
          lte(transaction.postedOn, today),
          cursor ? gt(transaction.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(transaction.id))
      .limit(500);
    result.push(...page);
    if (result.length > MAX_CHARGES)
      throw new Error("Recurring analysis history limit exceeded");
    if (page.length < 500) return result;
    cursor = page.at(-1)!.id;
  }
}

/** Caller authorizes the workspace first. A read never persists suggestions. */
export async function listRecurringPayments(
  workspaceId: string,
  now = new Date(),
) {
  return db.transaction(
    async (tx) => {
      const today = todayIn(now);
      // One transaction uses one PG connection; run its queries sequentially.
      const charges = await ledger(tx, workspaceId, today);
      const saved = await tx
        .select()
        .from(recurringSeries)
        .where(eq(recurringSeries.workspaceId, workspaceId))
        .orderBy(asc(recurringSeries.id))
        .limit(MAX_SERIES + 1);
      const accounts = await tx
        .select({ id: financialAccount.id, name: financialAccount.nickname })
        .from(financialAccount)
        .where(eq(financialAccount.workspaceId, workspaceId))
        .orderBy(asc(financialAccount.nickname));
      if (saved.length > MAX_SERIES)
        throw new Error("Recurring series limit exceeded");
      const payments = buildPayments(charges, saved as SavedPayment[], today);
      return {
        today,
        payments,
        summary: summarizePayments(payments),
        accounts,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function listSubscriptions(workspaceId: string, now = new Date()) {
  return (await listRecurringPayments(workspaceId, now)).payments.filter(
    (payment) =>
      payment.kind === "subscription" &&
      payment.decision === "confirmed" &&
      payment.active,
  );
}

/** All recurring writes serialize per workspace; user fields are not refreshed. */
async function locked<T>(
  workspaceId: string,
  operation: (tx: Executor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId}, 53))`,
    );
    return operation(tx);
  });
}
async function accountExists(
  tx: Executor,
  workspaceId: string,
  accountId: string,
) {
  return (
    (
      await tx
        .select({ id: financialAccount.id })
        .from(financialAccount)
        .where(
          and(
            eq(financialAccount.workspaceId, workspaceId),
            eq(financialAccount.id, accountId),
          ),
        )
        .limit(1)
    ).length > 0
  );
}
async function getSaved(
  tx: Executor,
  workspaceId: string,
  accountId: string,
  merchant: string,
) {
  return (
    await tx
      .select()
      .from(recurringSeries)
      .where(owned(workspaceId, accountId, merchant))
      .limit(1)
  )[0];
}
async function atLimit(tx: Executor, workspaceId: string) {
  return (
    (
      await tx
        .select({ id: recurringSeries.id })
        .from(recurringSeries)
        .where(eq(recurringSeries.workspaceId, workspaceId))
        .limit(MAX_SERIES)
    ).length >= MAX_SERIES
  );
}

/** Public post-import hook. A financial commit has already succeeded; callers
 * catch/retry failures here. It never edits ledger rows or account balances. */
export async function refreshRecurringSeries(
  workspaceId: string,
  accountIds?: string[],
  now = new Date(),
): Promise<WriteResult> {
  if (accountIds?.length === 0) return "ok";
  if (accountIds)
    accountIds.forEach((accountId) =>
      targetSchema.shape.accountId.parse(accountId),
    );
  return locked(workspaceId, async (tx) => {
    const patterns = findPatterns(
      await ledger(tx, workspaceId, todayIn(now)),
      todayIn(now),
    ).filter(
      (pattern) => !accountIds || accountIds.includes(pattern.accountId),
    );
    const saved = await tx
      .select({
        accountId: recurringSeries.accountId,
        merchant: recurringSeries.merchant,
      })
      .from(recurringSeries)
      .where(eq(recurringSeries.workspaceId, workspaceId));
    const newCount = patterns.filter(
      (pattern) =>
        !saved.some(
          (row) =>
            row.accountId === pattern.accountId &&
            row.merchant === pattern.merchant,
        ),
    ).length;
    if (saved.length + newCount > MAX_SERIES) return "limit";
    for (const pattern of patterns) {
      const existing = await getSaved(
        tx,
        workspaceId,
        pattern.accountId,
        pattern.merchant,
      );
      if (existing) {
        await tx
          .update(recurringSeries)
          .set({
            observedOn: pattern.lastOn,
            observedAmountCents: pattern.lastAmount,
          })
          .where(owned(workspaceId, pattern.accountId, pattern.merchant));
      } else {
        await tx.insert(recurringSeries).values({
          id: uuidv7(),
          workspaceId,
          accountId: pattern.accountId,
          merchant: pattern.merchant,
          name: pattern.merchant.slice(0, 80),
          kind: pattern.kind,
          amountMode: pattern.amountMode,
          unit: pattern.unit,
          every: pattern.every,
          baselineAmountCents: pattern.typical,
          observedOn: pattern.lastOn,
          observedAmountCents: pattern.lastAmount,
        });
      }
    }
    return "ok";
  });
}

export async function confirmPattern(
  workspaceId: string,
  accountId: string,
  merchant: string,
  now = new Date(),
): Promise<WriteResult> {
  targetSchema.parse({ accountId, merchant });
  return locked(workspaceId, async (tx) => {
    if (!(await accountExists(tx, workspaceId, accountId))) return "not_found";
    const pattern = findPatterns(
      await ledger(tx, workspaceId, todayIn(now)),
      todayIn(now),
    ).find(
      (candidate) =>
        candidate.accountId === accountId && candidate.merchant === merchant,
    );
    if (!pattern) return "not_found";
    const existing = await getSaved(tx, workspaceId, accountId, merchant);
    if (existing)
      await tx
        .update(recurringSeries)
        .set({
          decision: "confirmed",
          baselineAmountCents: pattern.typical,
          ...(existing.decision === "candidate" && !existing.manual
            ? {
                kind: pattern.kind,
                amountMode: pattern.amountMode,
                unit: pattern.unit,
                every: pattern.every,
              }
            : {}),
        })
        .where(owned(workspaceId, accountId, merchant));
    else {
      if (await atLimit(tx, workspaceId)) return "limit";
      await tx.insert(recurringSeries).values({
        workspaceId,
        accountId,
        merchant,
        name: merchant.slice(0, 80),
        decision: "confirmed",
        kind: pattern.kind,
        amountMode: pattern.amountMode,
        unit: pattern.unit,
        every: pattern.every,
        baselineAmountCents: pattern.typical,
      });
    }
    return "ok";
  });
}

/** New manual entry or a user correction to an existing confirmed series. */
export async function savePayment(
  workspaceId: string,
  input: PaymentInput,
  editing = false,
): Promise<WriteResult> {
  paymentInputSchema.parse(input);
  return locked(workspaceId, async (tx) => {
    if (!(await accountExists(tx, workspaceId, input.accountId)))
      return "not_found";
    const existing = await getSaved(
      tx,
      workspaceId,
      input.accountId,
      input.merchant,
    );
    if (editing && !existing) return "not_found";
    if (!editing && existing?.decision === "confirmed") return "duplicate";
    const { useHistory, ...fields } = input;
    const values = {
      ...fields,
      amountCents: useHistory ? null : input.amountCents,
      decision: "confirmed" as const,
      manual: true,
      baselineAmountCents: input.amountCents,
    };
    if (existing)
      await tx
        .update(recurringSeries)
        .set({
          ...values,
          userIntent:
            input.kind === "subscription" ? existing.userIntent : "none",
        })
        .where(owned(workspaceId, input.accountId, input.merchant));
    else {
      if (await atLimit(tx, workspaceId)) return "limit";
      await tx.insert(recurringSeries).values({ ...values, workspaceId });
    }
    return "ok";
  });
}

export async function setPaymentIntent(
  workspaceId: string,
  accountId: string,
  merchant: string,
  intent: "none" | "keep" | "cancel",
): Promise<WriteResult> {
  targetSchema.parse({ accountId, merchant });
  intentSchema.parse(intent);
  return locked(workspaceId, async (tx) => {
    const row = await getSaved(tx, workspaceId, accountId, merchant);
    if (!row || row.decision !== "confirmed") return "not_found";
    if (row.kind !== "subscription") return "not_subscription";
    await tx
      .update(recurringSeries)
      .set({ userIntent: intent })
      .where(owned(workspaceId, accountId, merchant));
    return "ok";
  });
}

export async function setPaymentDisposition(
  workspaceId: string,
  accountId: string,
  merchant: string,
  disposition: "dismiss" | "restore" | "remove",
  now = new Date(),
): Promise<WriteResult> {
  targetSchema.parse({ accountId, merchant });
  dispositionSchema.parse(disposition);
  return locked(workspaceId, async (tx) => {
    const row = await getSaved(tx, workspaceId, accountId, merchant);
    if (!row) {
      if (
        disposition !== "dismiss" ||
        !(await accountExists(tx, workspaceId, accountId))
      )
        return "not_found";
      const pattern = findPatterns(
        await ledger(tx, workspaceId, todayIn(now)),
        todayIn(now),
      ).find(
        (candidate) =>
          candidate.accountId === accountId && candidate.merchant === merchant,
      );
      if (!pattern) return "not_found";
      if (await atLimit(tx, workspaceId)) return "limit";
      await tx.insert(recurringSeries).values({
        workspaceId,
        accountId,
        merchant,
        name: merchant.slice(0, 80),
        decision: "dismissed",
        kind: pattern.kind,
        amountMode: pattern.amountMode,
        unit: pattern.unit,
        every: pattern.every,
        baselineAmountCents: pattern.typical,
      });
    } else {
      // Removal keeps a suppression record: imported evidence cannot recreate it.
      await tx
        .update(recurringSeries)
        .set({
          decision:
            disposition === "restore"
              ? row.manual
                ? "confirmed"
                : "candidate"
              : "dismissed",
        })
        .where(owned(workspaceId, accountId, merchant));
    }
    return "ok";
  });
}
