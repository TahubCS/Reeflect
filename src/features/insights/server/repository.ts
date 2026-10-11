import "server-only";
import { and, asc, desc, eq, exists, gte, min } from "drizzle-orm";
import { listAccounts } from "@/features/accounts";
import {
  listCategories,
  listRules,
  withStarterRules,
} from "@/features/categorization";
import { db } from "@/lib/db/client";
import {
  insightSample,
  syntheticBatch,
  syntheticWorkspace,
  transaction,
} from "@/lib/db/schema";
import { cents } from "@/lib/money";
import type { SamplePerson } from "../domain/cohort";
import type { MeasureKey } from "../domain/metrics";
import type { IsoDate, PeriodDays } from "../domain/periods";
import type { WorkspaceData } from "../domain/workspace";

// Callers authorize first (ARCH-04). Your workspace's reads are filtered by
// its id; sample figures are synthetic, shared by every viewer, and never
// include anyone's transactions (ADR-056). No shared caches.

export type SampleBatch = { id: string; label: string; asOf: IsoDate };

/** The newest batch with stored figures, in the database the app uses. */
export async function newestSampleBatch(): Promise<SampleBatch | null> {
  const [batch] = await db
    .select({
      id: syntheticBatch.id,
      label: syntheticBatch.label,
      asOf: syntheticBatch.asOf,
    })
    .from(syntheticBatch)
    .where(
      exists(
        db
          .select({ one: insightSample.batchId })
          .from(insightSample)
          .where(eq(insightSample.batchId, syntheticBatch.id)),
      ),
    )
    .orderBy(desc(syntheticBatch.createdAt), desc(syntheticBatch.id))
    .limit(1);
  return batch ?? null;
}

/** Every sample person's figures for one period of the batch. */
export async function listSamplePeople(
  batchId: string,
  periodDays: PeriodDays,
): Promise<SamplePerson[]> {
  const rows = await db
    .select({
      workspaceId: insightSample.workspaceId,
      persona: syntheticWorkspace.persona,
      measure: insightSample.measure,
      value: insightSample.value,
    })
    .from(insightSample)
    .innerJoin(
      syntheticWorkspace,
      eq(syntheticWorkspace.workspaceId, insightSample.workspaceId),
    )
    .where(
      and(
        eq(insightSample.batchId, batchId),
        eq(insightSample.periodDays, periodDays),
      ),
    );
  const people = new Map<string, SamplePerson>();
  for (const row of rows) {
    const person = people.get(row.workspaceId) ?? {
      workspaceId: row.workspaceId,
      persona: row.persona,
      measures: {},
    };
    person.measures[row.measure as MeasureKey] = row.value;
    people.set(row.workspaceId, person);
  }
  return [...people.values()];
}

/**
 * Your workspace's accounts, categories, rules and transactions from `from`
 * on (later rows too: they undo balances back to the period's end).
 */
export async function loadWorkspaceData(
  workspaceId: string,
  from: IsoDate,
): Promise<WorkspaceData & { names: Record<string, string> }> {
  const [accounts, categories, rules, rows, [first]] = await Promise.all([
    listAccounts(workspaceId),
    listCategories(workspaceId),
    listRules(workspaceId),
    db
      .select({
        accountId: transaction.financialAccountId,
        postedOn: transaction.postedOn,
        amount: transaction.amountCents,
        descriptionRaw: transaction.descriptionRaw,
        isTransfer: transaction.isTransfer,
        categoryId: transaction.categoryId,
        categoryIsManual: transaction.categoryIsManual,
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.workspaceId, workspaceId),
          gte(transaction.postedOn, from),
        ),
      )
      .orderBy(asc(transaction.postedOn)),
    db
      .select({ first: min(transaction.postedOn) })
      .from(transaction)
      .where(eq(transaction.workspaceId, workspaceId)),
  ]);
  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      type: a.type,
      balance: a.balanceCents,
      balanceAsOf: a.balanceAsOf,
    })),
    categories: categories.map((c) => ({ id: c.id, presetKey: c.presetKey })),
    // The built-in keywords follow the saved rules (ADR-103).
    rules: withStarterRules(
      rules.map(({ id, categoryId, pattern, matchType, priority }) => ({
        id,
        categoryId,
        pattern,
        matchType,
        priority,
      })),
      categories,
    ),
    transactions: rows.map((r) => ({ ...r, amount: cents(r.amount) })),
    dataFrom: first?.first ?? null,
    names: Object.fromEntries(categories.map((c) => [c.presetKey, c.name])),
  };
}
