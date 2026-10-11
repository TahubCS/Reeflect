import { describe, expect, it } from "vitest";
import {
  type CategoryRule,
  categorizeTransaction,
  normalizeMerchant,
  PRESET_CATEGORIES,
} from "@/features/categorization/client";
import { cents } from "@/lib/money";
import example from "../../../../tests/fixtures/synthetic/example-spec.json";
import { PRESET_FOR, planCategories } from "./categories";
import { type GeneratedTransaction, expandSpec } from "./expand";
import { CATEGORIES, type Category, type SpecInput, parseSpec } from "./spec";

function row(
  id: string,
  description: string,
  category: Category,
): GeneratedTransaction {
  return {
    id,
    account: "checking",
    postedOn: "2026-09-01",
    amount: cents(-1_000),
    description,
    kind: "everyday",
    category,
    transferPair: null,
  };
}

describe("PRESET_FOR", () => {
  it("maps every generator category to a real preset or to none", () => {
    const keys = new Set<string>(PRESET_CATEGORIES.map((p) => p.key));
    for (const category of CATEGORIES) {
      const preset = PRESET_FOR[category];
      expect(preset === null || keys.has(preset)).toBe(true);
    }
  });

  it("keeps transfers out, and retirement and investing as saving (ADR-020, ADR-055)", () => {
    expect(PRESET_FOR.Transfers).toBeNull();
    expect(PRESET_FOR.Retirement).toBe("retirement");
    expect(PRESET_FOR.Investing).toBe("investing");
  });
});

describe("planCategories", () => {
  it("saves one exact rule per merchant that always means one preset", () => {
    const plan = planCategories([
      row("a", "Food Lion #1234", "Groceries"),
      row("b", "FOOD LION", "Groceries"),
      row("c", "Starbucks", "Coffee"),
    ]);
    expect(plan.rules).toEqual([
      { pattern: "Food Lion #1234", presetKey: "groceries" },
      { pattern: "Starbucks", presetKey: "dining" },
    ]);
    expect([...plan.byTransaction.values()]).toEqual([
      { presetKey: "groceries", manual: false },
      { presetKey: "groceries", manual: false },
      { presetKey: "dining", manual: false },
    ]);
  });

  it("makes manual choices for a merchant used for two things", () => {
    const plan = planCategories([
      row("a", "Amazon.com", "Shopping"),
      row("b", "Amazon.com", "Gifts"),
    ]);
    expect(plan.rules).toEqual([]);
    expect(plan.byTransaction.get("a")).toEqual({
      presetKey: "shopping",
      manual: true,
    });
    expect(plan.byTransaction.get("b")).toEqual({
      presetKey: "gifts",
      manual: true,
    });
  });

  it("leaves rows with no preset Uncategorized, and never a manual choice", () => {
    const plan = planCategories([
      row("a", "Transfer to savings", "Transfers"),
      row("b", "Etsy", "Other"),
      row("c", "Etsy", "Gifts"),
    ]);
    expect(plan.rules).toEqual([]);
    expect(plan.byTransaction.get("a")).toEqual({
      presetKey: null,
      manual: false,
    });
    expect(plan.byTransaction.get("b")).toEqual({
      presetKey: null,
      manual: false,
    });
    expect(plan.byTransaction.get("c")).toEqual({
      presetKey: "gifts",
      manual: true,
    });
  });

  it("gives every generated row the category F-08's engine computes from the plan", () => {
    const parsed = parseSpec(structuredClone(example) as SpecInput);
    if (!parsed.ok) throw new Error(parsed.problems.join("\n"));
    const expansion = expandSpec(parsed.spec, { seed: "categories-1" });
    for (const person of expansion.people) {
      const plan = planCategories(person.transactions);
      const rules: CategoryRule[] = plan.rules.map((r, i) => ({
        id: `rule-${i}`,
        categoryId: r.presetKey,
        pattern: r.pattern,
        matchType: "exact",
        priority: 100,
      }));
      const patterns = plan.rules.map((r) => normalizeMerchant(r.pattern));
      expect(new Set(patterns).size).toBe(patterns.length);
      for (const t of person.transactions) {
        const planned = plan.byTransaction.get(t.id)!;
        const result = categorizeTransaction({
          descriptionRaw: t.description,
          rules,
          manualOverride: planned.manual,
          manualCategoryId: planned.manual ? planned.presetKey : null,
        });
        if (!result.success) throw result.error;
        expect(result.data.categoryId).toBe(planned.presetKey);
        expect(planned.presetKey).toBe(PRESET_FOR[t.category]);
      }
    }
  });
});
