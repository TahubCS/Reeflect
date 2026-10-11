import { describe, expect, it } from "vitest";
import {
  type Categorization,
  type CategoryRule,
  categorizeTransaction,
  categoryRuleSchema,
} from "../client";

const rule = (overrides: Partial<CategoryRule> = {}): CategoryRule => ({
  id: "rule-groceries",
  categoryId: "category-groceries",
  pattern: "market",
  matchType: "contains",
  priority: 10,
  ...overrides,
});

function classify(
  descriptionRaw: string,
  rules: readonly CategoryRule[] = [rule()],
  manualCategoryId?: string | null,
): Categorization {
  const result = categorizeTransaction({
    descriptionRaw,
    rules,
    manualCategoryId,
  });
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("Expected valid categorization input");
  return result.data;
}

describe("categorizeTransaction", () => {
  it("matches a merchant after removing its store and reference numbers", () => {
    expect(classify("CORNER MARKET STORE #0042 REF ABC123")).toEqual({
      merchantNormalized: "corner market",
      categoryId: "category-groceries",
      matchedRuleId: "rule-groceries",
      origin: "rule",
    });
  });

  it.each(["WALMART #1234 RALEIGH NC", "WALMART #5678 DURHAM NC 27701"])(
    "an exact merchant rule matches location-bearing description %j",
    (description) => {
      expect(
        classify(description, [
          rule({ pattern: "walmart", matchType: "exact" }),
        ]),
      ).toMatchObject({
        merchantNormalized: "walmart",
        categoryId: "category-groceries",
        origin: "rule",
      });
    },
  );

  it.each([
    ["contains", "market", "corner market", true],
    ["contains", "market", "coffee shop", false],
    ["starts_with", "corner", "corner market", true],
    ["starts_with", "market", "corner market", false],
    ["exact", "corner market", "corner market", true],
    ["exact", "market", "corner market", false],
  ] as const)(
    "%s %j against %j produces match=%s",
    (matchType, pattern, merchant, expected) => {
      const result = classify(merchant, [rule({ matchType, pattern })]);
      expect(result.categoryId).toBe(expected ? "category-groceries" : null);
      expect(result.origin).toBe(expected ? "rule" : "uncategorized");
    },
  );

  it("normalizes rule patterns the same way as merchant descriptions", () => {
    expect(
      classify("CORNER MARKET #0042", [
        rule({ matchType: "exact", pattern: " Corner  MARKET STORE #99 " }),
      ]).origin,
    ).toBe("rule");
  });

  it("uses literal string matching, including punctuation", () => {
    expect(classify("Coffee shop", [rule({ pattern: ".*" })]).categoryId).toBe(
      null,
    );
    expect(
      classify("C++ [coffee]", [
        rule({ pattern: "C++ [coffee]", matchType: "exact" }),
      ]).origin,
    ).toBe("rule");
  });

  it("highest priority wins over rule order and match specificity", () => {
    const low = rule({ id: "a-low", matchType: "exact", pattern: "market" });
    const high = rule({
      id: "z-high",
      priority: 20,
      categoryId: "category-food",
    });
    for (const rules of [
      [low, high],
      [high, low],
    ]) {
      expect(classify("market", rules).matchedRuleId).toBe("z-high");
    }
  });

  it("a higher-priority rule that does not match cannot win", () => {
    expect(
      classify("corner market", [
        rule({ id: "high", priority: 100, pattern: "coffee" }),
        rule(),
      ]).matchedRuleId,
    ).toBe("rule-groceries");
  });

  it("negative priorities are ordered numerically", () => {
    expect(
      classify("market", [
        rule({ id: "a", priority: -20 }),
        rule({ id: "b", priority: -10 }),
      ]).matchedRuleId,
    ).toBe("b");
  });

  it("equal priorities use the smallest rule id regardless of order", () => {
    const a = rule({ id: "a", categoryId: "category-a" });
    const b = rule({ id: "b", categoryId: "category-b" });
    const c = rule({ id: "c", categoryId: "category-c" });
    for (const rules of [
      [a, b, c],
      [c, b, a],
      [b, a, c],
      [b, c, a],
    ]) {
      expect(classify("market", rules)).toMatchObject({
        categoryId: "category-a",
        matchedRuleId: "a",
      });
    }
  });

  it("a manual override beats every matching rule", () => {
    expect(classify("corner market", [rule()], "category-personal")).toEqual({
      merchantNormalized: "corner market",
      categoryId: "category-personal",
      matchedRuleId: null,
      origin: "manual",
    });
  });

  it("a manual override also works without rules", () => {
    expect(classify("Unknown merchant", [], "category-personal").origin).toBe(
      "manual",
    );
  });

  it("null means no manual override", () => {
    expect(classify("market", [rule()], null).origin).toBe("rule");
  });

  it.each(["", "   ", "unknown merchant"])(
    "returns Uncategorized for %j without fabricating a category id",
    (description) => {
      expect(classify(description)).toMatchObject({
        categoryId: null,
        matchedRuleId: null,
        origin: "uncategorized",
      });
    },
  );

  it("returns Uncategorized when no rules exist", () => {
    expect(classify("market", []).origin).toBe("uncategorized");
  });

  it("preserves an explicit manual Uncategorized choice over a matching rule", () => {
    expect(
      categorizeTransaction({
        descriptionRaw: "market",
        rules: [rule()],
        manualOverride: true,
        manualCategoryId: null,
      }),
    ).toEqual({
      success: true,
      data: {
        merchantNormalized: "market",
        categoryId: null,
        matchedRuleId: null,
        origin: "manual",
      },
    });
  });

  it("supports a manual override flag without a category id", () => {
    const result = categorizeTransaction({
      descriptionRaw: "market",
      rules: [rule()],
      manualOverride: true,
    });
    expect(result).toMatchObject({
      success: true,
      data: { categoryId: null, origin: "manual" },
    });
  });

  it("continues matching when the manual override flag is false", () => {
    const result = categorizeTransaction({
      descriptionRaw: "market",
      rules: [rule()],
      manualOverride: false,
    });
    expect(result).toMatchObject({ success: true, data: { origin: "rule" } });
  });

  it("does not mutate frozen input or reorder rules on repeated calls", () => {
    const rules = Object.freeze([
      Object.freeze(rule({ id: "b" })),
      Object.freeze(rule({ id: "a" })),
    ]);
    const input = Object.freeze({ descriptionRaw: "MARKET #42", rules });
    const before = JSON.stringify(input);

    const first = categorizeTransaction(input);
    expect(first.success).toBe(true);
    expect(categorizeTransaction(input)).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    null,
    undefined,
    {},
    { descriptionRaw: 12, rules: [] },
    { descriptionRaw: "market", rules: null },
    { descriptionRaw: "market", rules: [null] },
    { descriptionRaw: "market", rules: [], manualCategoryId: " " },
    { descriptionRaw: "market", rules: [], manualCategoryId: 12 },
    { descriptionRaw: "market", rules: [], manualOverride: "true" },
    {
      descriptionRaw: "market",
      rules: [rule({ matchType: "regex" as "exact" })],
    },
    { descriptionRaw: "market", rules: [rule({ priority: NaN })] },
    { descriptionRaw: "market", rules: [rule({ priority: Infinity })] },
    { descriptionRaw: "market", rules: [rule({ priority: 1.5 })] },
    {
      descriptionRaw: "market",
      rules: [rule({ priority: Number.MAX_SAFE_INTEGER + 1 })],
    },
    { descriptionRaw: "market", rules: [rule({ pattern: " " })] },
    { descriptionRaw: "market", rules: [rule({ pattern: "STORE #42" })] },
    { descriptionRaw: "market", rules: [rule({ pattern: "#42" })] },
    { descriptionRaw: "market", rules: [rule({ pattern: "REF ABC123" })] },
    { descriptionRaw: "market", rules: [rule({ pattern: "a".repeat(501) })] },
    { descriptionRaw: "market", rules: [rule({ id: " " })] },
    { descriptionRaw: "market", rules: [rule({ categoryId: " " })] },
    { descriptionRaw: "a".repeat(2_001), rules: [] },
    { descriptionRaw: "market", rules: [], amountCents: -1_200 },
  ])(
    "returns a validation error instead of throwing for invalid input %#",
    (input) => {
      const before = JSON.stringify(input);
      const result = categorizeTransaction(input);
      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected invalid input to fail");
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(JSON.stringify(input)).toBe(before);
    },
  );

  it("rejects duplicate ids, including ids duplicated after trimming", () => {
    const result = categorizeTransaction({
      descriptionRaw: "market",
      rules: [rule(), rule({ id: " rule-groceries " })],
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected duplicate rule ids to fail");
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({ path: ["rules", 1, "id"] }),
    );
  });

  it("rejects oversized rule collections", () => {
    expect(
      categorizeTransaction({
        descriptionRaw: "market",
        // Saved rules (up to 1,000) plus the built-in keywords fit in 2,000.
        rules: Array.from({ length: 2_001 }, (_, i) =>
          rule({ id: `rule-${i}` }),
        ),
      }).success,
    ).toBe(false);
  });

  it("a manual override does not bypass invalid rule validation", () => {
    expect(
      categorizeTransaction({
        descriptionRaw: "market",
        manualCategoryId: "category-personal",
        rules: [rule({ pattern: "" })],
      }).success,
    ).toBe(false);
  });

  it("exports rule validation for future save-rule boundaries", () => {
    expect(categoryRuleSchema.safeParse(rule()).success).toBe(true);
    expect(categoryRuleSchema.safeParse(rule({ pattern: "" })).success).toBe(
      false,
    );
  });
});
