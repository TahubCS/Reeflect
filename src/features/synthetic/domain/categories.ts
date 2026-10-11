// The generator's categories are finer than F-08's presets. This maps each
// one onto a preset where one fits (ADR-055), and plans how a loaded sample
// person ends up categorized: saved merchant rules, as a real user would
// have, plus manual choices where a rule can't say it.
import {
  normalizeMerchant,
  type PresetKey,
} from "@/features/categorization/client";
import type { GeneratedTransaction } from "./expand";
import type { Category } from "./spec";

/** Null: no preset fits, and the row stays Uncategorized. */
export const PRESET_FOR: Record<Category, PresetKey | null> = {
  Groceries: "groceries",
  "Eating out": "dining",
  Coffee: "dining",
  Transport: "transport",
  Shopping: "shopping",
  Fun: "entertainment",
  Health: "health",
  Travel: "travel",
  "Personal care": "personal_care",
  Kids: "kids",
  Gifts: "gifts",
  Other: null,
  Housing: "housing",
  Utilities: "utilities",
  "Phone & internet": "utilities",
  Insurance: "insurance",
  Loans: "loans",
  Childcare: "kids",
  Education: null,
  Pay: "income",
  Subscriptions: "subscriptions",
  // Both sides of a transfer are the workspace's own money (ADR-020).
  Transfers: null,
  // A card's interest charge: a cost of debt, not a purchase or a loan payment.
  Interest: null,
  Retirement: "retirement",
  Investing: "investing",
};

export type CategoryPlan = {
  /** One exact-match rule per merchant that always means one preset. */
  rules: { pattern: string; presetKey: PresetKey }[];
  /** Per transaction id: its preset (or null), and whether it is a manual choice. */
  byTransaction: Map<string, { presetKey: PresetKey | null; manual: boolean }>;
};

/**
 * A merchant gets a rule when every one of the person's rows with that
 * merchant maps to the same preset. A merchant used for two things (say
 * Amazon.com for shopping and for gifts) gets no rule; its rows with a preset
 * become manual choices, and the rest stay Uncategorized.
 */
export function planCategories(
  transactions: readonly GeneratedTransaction[],
): CategoryPlan {
  const merchants = new Map<
    string,
    { pattern: string; presets: Set<PresetKey | null> }
  >();
  for (const t of transactions) {
    const merchant = normalizeMerchant(t.description);
    const entry = merchants.get(merchant) ?? {
      pattern: t.description,
      presets: new Set<PresetKey | null>(),
    };
    entry.presets.add(PRESET_FOR[t.category]);
    merchants.set(merchant, entry);
  }

  const rules: CategoryPlan["rules"] = [];
  const ruled = new Set<string>();
  for (const [merchant, { pattern, presets }] of merchants) {
    const [only] = presets;
    if (merchant !== "" && presets.size === 1 && only) {
      rules.push({ pattern, presetKey: only });
      ruled.add(merchant);
    }
  }

  const byTransaction: CategoryPlan["byTransaction"] = new Map();
  for (const t of transactions) {
    const presetKey = PRESET_FOR[t.category];
    const manual =
      presetKey !== null && !ruled.has(normalizeMerchant(t.description));
    byTransaction.set(t.id, { presetKey, manual });
  }
  return { rules, byTransaction };
}
