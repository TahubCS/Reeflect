import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  categoryNameSchema,
  formValues,
  objectIdSchema,
  overrideFormInput,
  overrideInputSchema,
  pageNumberSchema,
  PRESET_CATEGORIES,
  rejectedForm,
  ruleFormInput,
  ruleInputSchema,
} from "./forms";

const categoryId = crypto.randomUUID();
const rule = {
  categoryId,
  pattern: "CORNER MARKET #42",
  matchType: "contains",
  priority: 100,
};
const form = (values: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe("rule forms", () => {
  it.each(["contains", "starts_with", "exact"])(
    "accepts a literal %s rule",
    (matchType) => {
      expect(
        ruleInputSchema.parse({ ...rule, pattern: "  market  ", matchType }),
      ).toEqual({ ...rule, pattern: "market", matchType });
    },
  );
  it.each([-1_000_000, 0, 1_000_000])(
    "accepts a bounded integer priority %i",
    (priority) => {
      expect(ruleInputSchema.parse({ ...rule, priority }).priority).toBe(
        priority,
      );
    },
  );
  it.each(["", " ", "1.5", "1e3", "abc", "Infinity", "--1"])(
    "rejects malformed priority %j instead of coercing it to a valid rule",
    (priority) => {
      expect(
        ruleInputSchema.safeParse(ruleFormInput(form({ ...rule, priority })))
          .success,
      ).toBe(false);
    },
  );
  it.each([-1_000_001, 1_000_001, Number.MAX_SAFE_INTEGER, NaN, Infinity])(
    "rejects unsafe database priority %j",
    (priority) => {
      expect(ruleInputSchema.safeParse({ ...rule, priority }).success).toBe(
        false,
      );
    },
  );
  it("parses a negative form priority", () => {
    expect(
      ruleInputSchema.parse(ruleFormInput(form({ ...rule, priority: "-12" }))),
    ).toEqual({ ...rule, priority: -12 });
  });
  it.each(["", "STORE #42", "ref ABC123", "x".repeat(501)])(
    "rejects an empty, metadata-only or oversized pattern %j",
    (pattern) => {
      expect(ruleInputSchema.safeParse({ ...rule, pattern }).success).toBe(
        false,
      );
    },
  );
  it.each(["", "not-an-id", null, 12])(
    "rejects malformed category %j",
    (id) => {
      expect(
        ruleInputSchema.safeParse({ ...rule, categoryId: id }).success,
      ).toBe(false);
      expect(objectIdSchema.safeParse(id).success).toBe(false);
    },
  );
  it("rejects regex matching and unexpected fields", () => {
    expect(
      ruleInputSchema.safeParse({ ...rule, matchType: "regex" }).success,
    ).toBe(false);
    expect(
      ruleInputSchema.safeParse({ ...rule, workspaceId: "other" }).success,
    ).toBe(false);
  });
  it("rejects missing priority and file values", () => {
    const data = form({ categoryId, pattern: "market", matchType: "exact" });
    expect(ruleInputSchema.safeParse(ruleFormInput(data)).success).toBe(false);
    data.set("priority", new Blob(["100"]));
    expect(ruleInputSchema.safeParse(ruleFormInput(data)).success).toBe(false);
  });
});

describe("manual overrides", () => {
  it("stores an explicit manual Uncategorized choice", () => {
    expect(
      overrideInputSchema.parse(
        overrideFormInput(form({ mode: "manual", categoryId: "" })),
      ),
    ).toEqual({ mode: "manual", categoryId: null });
  });
  it("clears a manual choice by selecting automatic categorization", () => {
    expect(
      overrideInputSchema.parse(
        overrideFormInput(form({ mode: "automatic", categoryId: "automatic" })),
      ),
    ).toEqual({ mode: "automatic", categoryId: null });
  });
  it("validates the optional rule together with its matching manual category", () => {
    const data = form({
      ...rule,
      priority: "100",
      mode: "manual",
      saveRule: "on",
    });
    expect(overrideInputSchema.parse(overrideFormInput(data))).toEqual({
      mode: "manual",
      categoryId,
      rule,
    });
  });
  it("ignores unused rule fields when the checkbox is off", () => {
    expect(
      overrideInputSchema.parse(
        overrideFormInput(
          form({
            mode: "manual",
            categoryId,
            pattern: "",
            priority: "oops",
            saveRule: "false",
          }),
        ),
      ),
    ).toEqual({ mode: "manual", categoryId });
  });
  it.each([
    { mode: "automatic", categoryId },
    { mode: "automatic", categoryId: null, rule },
    { mode: "manual", categoryId: crypto.randomUUID(), rule },
    { mode: "manual", categoryId: null, rule },
    { mode: "other", categoryId: null },
  ])("rejects contradictory or invalid override %#", (input) => {
    expect(overrideInputSchema.safeParse(input).success).toBe(false);
  });
  it("cannot save Uncategorized as a keyword rule", () => {
    expect(
      overrideInputSchema.safeParse(
        overrideFormInput(
          form({
            mode: "manual",
            categoryId: "",
            saveRule: "on",
            pattern: "market",
            matchType: "exact",
            priority: "100",
          }),
        ),
      ).success,
    ).toBe(false);
  });
  it("rejects a missing category instead of clearing an override", () => {
    expect(
      overrideInputSchema.safeParse(overrideFormInput(form({ mode: "manual" })))
        .success,
    ).toBe(false);
  });
});

describe("safe errors and names", () => {
  it("returns first error per field, including a form-level error", () => {
    const error = new z.ZodError([
      { code: "custom", path: ["pattern"], message: "First" },
      { code: "custom", path: ["pattern"], message: "Second" },
      { code: "custom", path: [], message: "Form error" },
    ]);
    expect(rejectedForm(error, form({ pattern: "market" }))).toEqual({
      errors: { pattern: "First", form: "Form error" },
      values: { pattern: "market" },
    });
  });
  it("echoes only bounded known string fields, ignoring prototype keys and files", () => {
    const data = form({
      pattern: "x".repeat(600),
      categoryId,
      matchType: "exact",
      priority: "100",
      saveRule: "on",
      mode: "manual",
      name: "Food",
      __proto__: "ignored",
      constructor: "ignored",
      extra: "ignored",
    });
    data.set("__proto__", "ignored");
    expect(formValues(data)).toEqual({
      pattern: "x".repeat(500),
      categoryId,
      matchType: "exact",
      priority: "100",
      saveRule: "on",
      mode: "manual",
      name: "Food",
    });
    data.set("name", new Blob(["Food"]));
    expect(formValues(data).name).toBeUndefined();
    expect(Object.getPrototypeOf(formValues(data))).toBe(Object.prototype);
  });
  it("trims category names and accepts their maximum length", () => {
    expect(categoryNameSchema.parse("  Food & drink  ")).toBe("Food & drink");
    expect(categoryNameSchema.parse("x".repeat(60))).toHaveLength(60);
  });
  it.each(["", " ", "x".repeat(61), null, 12])(
    "rejects invalid category name %j",
    (input) => {
      expect(categoryNameSchema.safeParse(input).success).toBe(false);
    },
  );
  it.each(["", "abc", "-1", "0", "1.5", "100001", ["2", "3"]])(
    "falls back to the first page for invalid pagination %j",
    (input) => {
      expect(pageNumberSchema.parse(input)).toBe(1);
    },
  );
  it("accepts bounded page numbers", () => {
    expect(pageNumberSchema.parse("2")).toBe(2);
    expect(pageNumberSchema.parse("100000")).toBe(100000);
  });
});

describe("PRESET_CATEGORIES", () => {
  it("keeps the first eight in place, so seeded sort orders never move (ADR-057)", () => {
    expect(PRESET_CATEGORIES.slice(0, 8).map((p) => p.key)).toEqual([
      "groceries",
      "dining",
      "transport",
      "housing",
      "utilities",
      "shopping",
      "entertainment",
      "income",
    ]);
  });
  it("has unique keys and unique names, ignoring case", () => {
    const keys = PRESET_CATEGORIES.map((p) => p.key);
    const names = PRESET_CATEGORIES.map((p) => p.name.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });
  it("includes retirement and investing as saving categories (ADR-055)", () => {
    expect(PRESET_CATEGORIES.map((p) => p.key)).toEqual(
      expect.arrayContaining(["retirement", "investing"]),
    );
  });
});
