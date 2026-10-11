import { z } from "zod";
import { normalizeMerchant } from "./normalize-merchant";

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
  matchType: z.enum(["contains", "starts_with", "exact"]),
  priority: z.number().int(),
});

export type CategoryRule = z.infer<typeof categoryRuleSchema>;

export const categorizationInputSchema = z
  .strictObject({
    descriptionRaw: z.string().max(2_000),
    rules: z.array(categoryRuleSchema).max(1_000),
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

function matches(merchant: string, rule: CategoryRule): boolean {
  const pattern = normalizeMerchant(rule.pattern);
  switch (rule.matchType) {
    case "contains":
      return merchant.includes(pattern);
    case "starts_with":
      return merchant.startsWith(pattern);
    case "exact":
      return merchant === pattern;
  }
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

  let winner: CategoryRule | undefined;
  for (const rule of rules) {
    if (!matches(merchantNormalized, rule)) continue;
    if (
      !winner ||
      rule.priority > winner.priority ||
      (rule.priority === winner.priority && rule.id < winner.id)
    ) {
      winner = rule;
    }
  }

  return {
    success: true,
    data: {
      merchantNormalized,
      categoryId: winner?.categoryId ?? null,
      matchedRuleId: winner?.id ?? null,
      origin: winner ? "rule" : "uncategorized",
    },
  };
}
