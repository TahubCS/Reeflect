import "server-only";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { financialAccount } from "@/lib/db/schema";

/**
 * Whether the workspace has Nessie accounts, and when they were last
 * synced. A sync always rewrites each account, so `updated_at` is the
 * last-synced time (no sync log is kept). Linking leaves `balance_as_of`
 * empty, which means "not synced yet".
 */
export async function lastNessieSync(
  workspaceId: string,
): Promise<{ linked: boolean; lastSyncedAt: string | null }> {
  const [row] = await db
    .select({
      last: max(financialAccount.updatedAt),
      synced: max(financialAccount.balanceAsOf),
      id: max(financialAccount.id),
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.workspaceId, workspaceId),
        eq(financialAccount.source, "nessie"),
      ),
    );
  return {
    linked: Boolean(row?.id),
    lastSyncedAt:
      row?.synced && row.last ? new Date(row.last).toISOString() : null,
  };
}
