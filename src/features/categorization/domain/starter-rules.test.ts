import { describe, expect, it } from "vitest";
import { type CategoryRule, classifyStored } from "./categorize";
import { PRESET_CATEGORIES, ruleInputSchema } from "./forms";
import {
  STARTER_KEYWORDS,
  containsWords,
  starterRules,
  withStarterRules,
  words,
} from "./starter-rules";

const CATEGORIES = PRESET_CATEGORIES.map((preset) => ({
  id: `category-${preset.key}`,
  presetKey: preset.key,
}));

/** The category "Choose for me" gives `description` with no saved rules. */
function chosen(description: string, rules: CategoryRule[] = []) {
  return classifyStored(
    { descriptionRaw: description, categoryId: null, categoryIsManual: false },
    withStarterRules(rules, CATEGORIES),
  ).categoryId;
}

describe("containsWords", () => {
  it("matches whole words, in a row, ignoring case and punctuation", () => {
    expect(containsWords("shell oil 1234", "shell")).toBe(true);
    expect(containsWords("uber eats order", "uber eats")).toBe(true);
    expect(containsWords("mcdonald's", "McDonald's")).toBe(true);
  });

  it("never matches part of a word or words out of order", () => {
    expect(containsWords("las vegas hotel", "gas")).toBe(false);
    expect(containsWords("eats uber", "uber eats")).toBe(false);
    expect(containsWords("shellfish shack", "shell")).toBe(false);
  });

  it("matches nothing for a keyword with no words", () => {
    expect(containsWords("anything", "#!")).toBe(false);
  });
});

describe("Choose for me with the built-in keywords (ADR-103)", () => {
  it.each([
    ["Lunch", "category-dining"],
    ["Coffee with Sam", "category-dining"],
    ["STARBUCKS STORE #1234", "category-dining"],
    ["Bus pass", "category-transport"],
    ["Uber trip", "category-transport"],
    ["Uber Eats", "category-dining"],
    ["Subway", "category-dining"],
    ["Subway fare", "category-transport"],
    ["Gas", "category-transport"],
    ["Gas bill", "category-utilities"],
    ["Rent", "category-housing"],
    ["Kroger", "category-groceries"],
    ["Netflix", "category-subscriptions"],
    ["Concert tickets", "category-entertainment"],
    ["Paycheck", "category-income"],
    ["Birthday gift", "category-gifts"],
  ])("puts %s in %s", (description, category) => {
    expect(chosen(description)).toBe(category);
  });

  it("leaves what it does not know Uncategorized", () => {
    expect(chosen("Thing for Alex")).toBeNull();
    expect(chosen("Las Vegas")).toBeNull();
  });

  it("lets every saved rule win over a built-in keyword", () => {
    const saved: CategoryRule = {
      id: "rule-1",
      categoryId: "category-shopping",
      pattern: "coffee",
      matchType: "contains",
      priority: -1_000_000,
    };

    expect(chosen("Coffee beans", [saved])).toBe("category-shopping");
  });
});

describe("starterRules", () => {
  it("points at the workspace's own preset categories and skips missing ones", () => {
    const rules = starterRules([{ id: "mine", presetKey: "housing" }]);

    expect(rules.length).toBe(STARTER_KEYWORDS.housing!.length);
    expect(new Set(rules.map((r) => r.categoryId))).toEqual(new Set(["mine"]));
    expect(rules.every((r) => r.matchType === "word")).toBe(true);
  });

  it("ignores categories the person made, which have no preset", () => {
    expect(starterRules([{ id: "custom", presetKey: null }])).toEqual([]);
  });

  it("has unique ids, and every keyword has words", () => {
    const rules = starterRules(CATEGORIES);

    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    for (const rule of rules)
      expect(words(rule.pattern).length).toBeGreaterThan(0);
  });

  it("never gives one keyword two categories", () => {
    const seen = new Map<string, string>();
    for (const [preset, keywords] of Object.entries(STARTER_KEYWORDS)) {
      for (const keyword of keywords ?? []) {
        const key = words(keyword).join(" ");
        expect(seen.get(key), `${keyword} is in ${seen.get(key)}`).toBe(
          undefined,
        );
        seen.set(key, preset);
      }
    }
  });

  it("only uses preset keys that exist", () => {
    const keys = new Set<string>(PRESET_CATEGORIES.map((p) => p.key));
    for (const preset of Object.keys(STARTER_KEYWORDS))
      expect(keys.has(preset)).toBe(true);
  });
});

describe("saved rules", () => {
  it("cannot use the built-in word match", () => {
    expect(
      ruleInputSchema.safeParse({
        categoryId: "0199d5a0-0000-7000-8000-000000000001",
        pattern: "coffee",
        matchType: "word",
        priority: 0,
      }).success,
    ).toBe(false);
  });
});
