import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "./client";
import { billPayment } from "./schema";

export type LedgerTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Shared with Bills; acquire BEFORE transaction/account row locks. */
export async function lockLedgerWorkspace(tx: LedgerTx, workspaceId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId}, 53))`,
  );
}
/** Metadata reclassification must not invalidate saved invoice evidence. */
export async function hasBillEvidence(
  tx: LedgerTx,
  workspaceId: string,
  ids: string[],
): Promise<boolean> {
  if (!ids.length) return false;
  const rows = await tx
    .select({ id: billPayment.id })
    .from(billPayment)
    .where(
      and(
        eq(billPayment.workspaceId, workspaceId),
        inArray(billPayment.originalTransactionId, ids),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
