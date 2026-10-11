// Expansion → database rows. Each synthetic person becomes an ordinary
// workspace with accounts and transactions, plus a `synthetic_workspace`
// marker naming the batch (ADR-049), and F-08 categories and rules (ADR-055).
import { PRESET_CATEGORIES } from "@/features/categorization/client";
import { type Expansion, planCategories } from "@/features/synthetic";
import type {
  category,
  categoryRule,
  financialAccount,
  organization,
  syntheticWorkspace,
  transaction,
} from "@/lib/db/schema";

export type BatchRows = {
  organizations: (typeof organization.$inferInsert)[];
  markers: (typeof syntheticWorkspace.$inferInsert)[];
  categories: (typeof category.$inferInsert)[];
  rules: (typeof categoryRule.$inferInsert)[];
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
    categories: [],
    rules: [],
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

    // F-08's presets, as its first editor visit would seed them, plus the
    // rules and manual choices that give each row its category (ADR-055).
    const categoryIds = new Map<string, string>();
    PRESET_CATEGORIES.forEach((preset, sortOrder) => {
      const id = newId();
      categoryIds.set(preset.key, id);
      rows.categories.push({
        id,
        workspaceId,
        name: preset.name,
        colorToken: preset.colorToken,
        sortOrder,
        presetKey: preset.key,
      });
    });
    const plan = planCategories(person.transactions);
    for (const rule of plan.rules) {
      rows.rules.push({
        id: newId(),
        workspaceId,
        pattern: rule.pattern,
        matchType: "exact",
        categoryId: categoryIds.get(rule.presetKey)!,
      });
    }

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
      const categorized = plan.byTransaction.get(t.id)!;
      rows.transactions.push({
        id: newId(),
        workspaceId,
        financialAccountId: accountIds.get(t.account)!,
        postedOn: t.postedOn,
        amountCents: t.amount,
        descriptionRaw: t.description,
        status: "posted",
        // Money into an IRA or brokerage leaves the workspace unpaired, but
        // is marked so it never counts as spending (ADR-020, ADR-053).
        isTransfer: t.transferPair !== null || t.kind === "investment",
        transferPairId,
        categoryId: categorized.presetKey
          ? categoryIds.get(categorized.presetKey)!
          : null,
        categoryIsManual: categorized.manual,
        source: "synthetic",
        // The generator's own id: the same row on every replay of the batch.
        externalId: t.id,
        fingerprint: `synthetic:${t.id}`,
      });
    }
  }
  return rows;
}
