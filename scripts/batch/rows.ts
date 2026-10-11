// Expansion → database rows. Each synthetic person becomes an ordinary
// workspace with accounts and transactions, plus a `synthetic_workspace`
// marker naming the batch (ADR-049).
import type { Expansion } from "@/features/synthetic";
import type {
  financialAccount,
  organization,
  syntheticWorkspace,
  transaction,
} from "@/lib/db/schema";

export type BatchRows = {
  organizations: (typeof organization.$inferInsert)[];
  markers: (typeof syntheticWorkspace.$inferInsert)[];
  accounts: (typeof financialAccount.$inferInsert)[];
  transactions: (typeof transaction.$inferInsert)[];
};

export const INSTITUTION = "Capital One";
/** Shown wherever a synthetic workspace's name appears (ADR-024's "Sample" label). */
export const NAME_PREFIX = "Sample · ";

export function buildRows(
  expansion: Expansion,
  options: { batchId: string; now: Date; newId: () => string },
): BatchRows {
  const { batchId, now, newId } = options;
  const rows: BatchRows = {
    organizations: [],
    markers: [],
    accounts: [],
    transactions: [],
  };
  for (const person of expansion.people) {
    const workspaceId = newId();
    rows.organizations.push({
      id: workspaceId,
      name: `${NAME_PREFIX}${person.name}`,
      slug: `synthetic-${batchId}-${person.key}`,
      createdAt: now,
      metadata: JSON.stringify({ synthetic: true, batchId }),
    });
    rows.markers.push({
      workspaceId,
      batchId,
      personKey: person.key,
      persona: person.persona,
      summary: person.summary,
    });

    const accountIds = new Map<string, string>();
    for (const account of person.accounts) {
      const id = newId();
      accountIds.set(account.key, id);
      rows.accounts.push({
        id,
        workspaceId,
        institutionName: INSTITUTION,
        type: account.type,
        maskLast4: account.mask,
        nickname: account.nickname,
        source: "synthetic",
        currentBalanceCents: account.closingBalance,
        balanceAsOf: expansion.asOf,
      });
    }

    const pairIds = new Map<string, string>();
    for (const t of person.transactions) {
      let transferPairId: string | null = null;
      if (t.transferPair !== null) {
        transferPairId = pairIds.get(t.transferPair) ?? newId();
        pairIds.set(t.transferPair, transferPairId);
      }
      rows.transactions.push({
        id: newId(),
        workspaceId,
        financialAccountId: accountIds.get(t.account)!,
        postedOn: t.postedOn,
        amountCents: t.amount,
        descriptionRaw: t.description,
        status: "posted",
        // Money into an IRA or brokerage leaves the workspace unpaired, but
        // is marked so it never counts as spending (ADR-020, ADR-052).
        isTransfer: t.transferPair !== null || t.kind === "investment",
        transferPairId,
        source: "synthetic",
        // The generator's own id: the same row on every replay of the batch.
        externalId: t.id,
        fingerprint: `synthetic:${t.id}`,
      });
    }
  }
  return rows;
}
