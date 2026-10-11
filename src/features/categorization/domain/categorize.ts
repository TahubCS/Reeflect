import { z } from "zod";
import { normalizeMerchant } from "./normalize-merchant";
import { hasWordsInRow, splitWords } from "./starter-rules";

const identifier = z.string().trim().min(1).max(128);

export const categoryRuleSchema = z.strictObject({
  id: identifier,
  categoryId: identifier,
  pattern: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((pattern) => normalizeMerchant(pattern).length > 0, {
      message:
        "Enter a merchant keyword, not just a store or reference number.",
    }),
  /** `word` is for the built-in keywords only (ADR-103); people save the others. */
  matchType: z.enum(["contains", "starts_with", "exact", "word"]),
  priority: z.number().int(),
});

export type CategoryRule = z.infer<typeof categoryRuleSchema>;

export const categorizationInputSchema = z
  .strictObject({
    descriptionRaw: z.string().max(2_000),
    // A workspace's saved rules (at most MAX_RULES) plus the built-in ones.
    rules: z.array(categoryRuleSchema).max(2_000),
    /** Null or absent means there is no manual override. */
    manualCategoryId: identifier.nullable().optional(),
    /** An explicit Uncategorized choice is still a manual override. */
    manualOverride: z.boolean().optional(),
  })
  .superRefine(({ rules }, context) => {
    const seen = new Set<string>();
    for (const [index, rule] of rules.entries()) {
      if (seen.has(rule.id)) {
        context.addIssue({
          code: "custom",
          path: ["rules", index, "id"],
          message: "Rule ids must be unique.",
        });
      }
      seen.add(rule.id);
    }
  });

export type CategorizationInput = z.infer<typeof categorizationInputSchema>;

export type Categorization = {
  merchantNormalized: string;
  /** Null is Uncategorized; the caller owns category ids and display names. */
  categoryId: string | null;
  matchedRuleId: string | null;
  /** Distinct from a transaction's bank/manual/csv/etc. source. */
  origin: "manual" | "rule" | "uncategorized";
};

export type CategorizationResult =
  | { success: true; data: Categorization }
  | { success: false; error: z.ZodError };

/** A rule with its pattern normalized once, not once per row. */
type CompiledRule = {
  rule: CategoryRule;
  pattern: string;
  /** The pattern's words, for `word` rules only. */
  words: string[];
};

const compile = (rules: readonly CategoryRule[]): CompiledRule[] =>
  rules.map((rule) => {
    const pattern = normalizeMerchant(rule.pattern);
    return {
      rule,
      pattern,
      words: rule.matchType === "word" ? splitWords(pattern) : [],
    };
  });

function matches(
  merchant: string,
  merchantWords: () => string[],
  { rule, pattern, words }: CompiledRule,
): boolean {
  switch (rule.matchType) {
    case "contains":
      return merchant.includes(pattern);
    case "starts_with":
      return merchant.startsWith(pattern);
    case "exact":
      return merchant === pattern;
    case "word":
      return hasWordsInRow(merchantWords(), words);
  }
}

/** The winning rule for a normalized merchant: highest priority, then lowest id. */
function winningRule(
  merchant: string,
  rules: readonly CompiledRule[],
): CategoryRule | undefined {
  let merchantWords: string[] | undefined;
  const wordsOf = () => (merchantWords ??= splitWords(merchant));
  let winner: CategoryRule | undefined;
  for (const compiled of rules) {
    const { rule } = compiled;
    // A rule that cannot win is not worth matching.
    if (
      winner &&
      (rule.priority < winner.priority ||
        (rule.priority === winner.priority && rule.id > winner.id))
    )
      continue;
    if (matches(merchant, wordsOf, compiled)) winner = rule;
  }
  return winner;
}

function categorization(
  merchantNormalized: string,
  winner: CategoryRule | undefined,
): Categorization {
  return {
    merchantNormalized,
    categoryId: winner?.categoryId ?? null,
    matchedRuleId: winner?.id ?? null,
    origin: winner ? "rule" : "uncategorized",
  };
}

/**
 * ADR-013. The caller supplies rules scoped to its verified workspace.
 * No I/O, money math, input mutation, or execution of user-supplied patterns.
 */
export function categorizeTransaction(input: unknown): CategorizationResult {
  const parsed = categorizationInputSchema.safeParse(input);
  if (!parsed.success) return parsed;

  const { descriptionRaw, rules, manualCategoryId, manualOverride } =
    parsed.data;
  const merchantNormalized = normalizeMerchant(descriptionRaw);
  if (manualCategoryId || manualOverride) {
    return {
      success: true,
      data: {
        merchantNormalized,
        categoryId: manualCategoryId ?? null,
        matchedRuleId: null,
        origin: "manual",
      },
    };
  }

  return {
    success: true,
    data: categorization(
      merchantNormalized,
      winningRule(merchantNormalized, compile(rules)),
    ),
  };
}

/** A stored transaction's category fields, as the database holds them. */
export type StoredCategorization = {
  descriptionRaw: string;
  categoryId: string | null;
  categoryIsManual: boolean;
};

/**
 * Each rule list `classifyStored` has seen, checked and compiled once: callers
 * classify many rows against one list (a month of budgets, a page of
 * transactions), and checking a few hundred rules per row is what made that
 * slow. Null marks a list that failed the check. Keyed by the array, so it
 * goes when the list does; callers never change a list once they pass it.
 */
const compiledLists = new WeakMap<
  readonly CategoryRule[],
  CompiledRule[] | null
>();

function compiledList(rules: readonly CategoryRule[]): CompiledRule[] | null {
  let compiled = compiledLists.get(rules);
  if (compiled === undefined) {
    const checked = categorizationInputSchema.safeParse({
      descriptionRaw: "",
      rules,
    });
    compiled = checked.success ? compile(checked.data.rules) : null;
    compiledLists.set(rules, compiled);
  }
  return compiled;
}

/** A description the engine accepts; longer ones fall back below. */
const MAX_DESCRIPTION = 2_000;

/**
 * The effective category of a stored row: its manual choice, else the
 * winning rule. Shared by every read of categories (the Transactions page,
 * Insights, batch rollups) so they always agree. Same answer as
 * `categorizeTransaction`, with the rules checked once per list.
 */
export function classifyStored(
  row: StoredCategorization,
  rules: CategoryRule[],
): Categorization {
  const compiled = compiledList(rules);
  if (compiled !== null && row.descriptionRaw.length <= MAX_DESCRIPTION) {
    const merchantNormalized = normalizeMerchant(row.descriptionRaw);
    if (row.categoryIsManual) {
      return {
        merchantNormalized,
        categoryId: row.categoryId,
        matchedRuleId: null,
        origin: "manual",
      };
    }
    return categorization(
      merchantNormalized,
      winningRule(merchantNormalized, compiled),
    );
  }
  // Historical/imported descriptions may exceed the form's bounds. Preserve
  // manual choices and leave automatic results uncategorized, without guessing.
  return {
    merchantNormalized: normalizeMerchant(row.descriptionRaw),
    categoryId: row.categoryIsManual ? row.categoryId : null,
    matchedRuleId: null,
    origin: row.categoryIsManual ? "manual" : "uncategorized",
  };
}
