import { z } from "zod";
import type { Cents } from "@/lib/money";
import { categoryRuleSchema, type CategoryRule } from "./categorize";

export const PRESET_CATEGORIES = [
  { key: "groceries", name: "Groceries", colorToken: "bar" },
  { key: "dining", name: "Dining", colorToken: "bar" },
  { key: "transport", name: "Transport", colorToken: "bar" },
  { key: "housing", name: "Housing", colorToken: "bill" },
  { key: "utilities", name: "Utilities", colorToken: "bill" },
  { key: "shopping", name: "Shopping", colorToken: "bar" },
  { key: "entertainment", name: "Entertainment", colorToken: "sub" },
  { key: "income", name: "Income", colorToken: "in" },
  // ADR-056: added after the first eight, so existing workspaces keep their
  // sort order and gain these on the next editor visit.
  { key: "health", name: "Health", colorToken: "bar" },
  { key: "insurance", name: "Insurance", colorToken: "bill" },
  { key: "loans", name: "Loans", colorToken: "bill" },
  { key: "subscriptions", name: "Subscriptions", colorToken: "sub" },
  { key: "personal_care", name: "Personal care", colorToken: "bar" },
  { key: "kids", name: "Kids & childcare", colorToken: "bar" },
  { key: "gifts", name: "Gifts", colorToken: "bar" },
  { key: "travel", name: "Travel", colorToken: "bar" },
  // Saving, never spending (ADR-054).
  { key: "retirement", name: "Retirement", colorToken: "save" },
  { key: "investing", name: "Investing", colorToken: "save" },
] as const;

export type PresetKey = (typeof PRESET_CATEGORIES)[number]["key"];

export const objectIdSchema = z.uuid();
export const MAX_RULES = 1_000;
export const PAGE_SIZE = 50;
export const ruleInputSchema = categoryRuleSchema.omit({ id: true }).extend({
  categoryId: objectIdSchema,
  priority: z.number().int().min(-1_000_000).max(1_000_000),
});
export type RuleInput = z.infer<typeof ruleInputSchema>;

export const overrideInputSchema = z
  .object({
    mode: z.enum(["manual", "automatic"]),
    categoryId: objectIdSchema.nullable(),
    rule: ruleInputSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.mode === "automatic" && input.categoryId !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Automatic categorization uses the saved rules.",
      });
    }
    if (
      input.rule &&
      (input.mode !== "manual" || input.rule.categoryId !== input.categoryId)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Choose a category before saving a rule.",
      });
    }
  });
export type OverrideInput = z.infer<typeof overrideInputSchema>;

export type CategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
  /** Stable across renames; Insights compares by it (ADR-055). */
  presetKey: string;
};
export type RuleSummary = CategoryRule & { categoryName: string };
export type TransactionSummary = {
  id: string;
  postedOn: string;
  descriptionRaw: string;
  merchantNormalized: string;
  accountName: string;
  amountCents: Cents;
  source: string;
  isTransfer: boolean;
  categoryId: string | null;
  categoryName: string;
  origin: "manual" | "rule" | "uncategorized";
};

export type FormState = {
  errors: Partial<Record<string, string>>;
  values?: Partial<Record<string, string>>;
};
export type FormAction = (
  previous: FormState,
  formData: FormData,
) => Promise<FormState>;

export function ruleFormInput(form: FormData): unknown {
  const priority = form.get("priority");
  return {
    pattern: form.get("pattern"),
    categoryId: form.get("categoryId"),
    matchType: form.get("matchType"),
    // Number('') is zero; a blank priority is invalid instead.
    priority:
      typeof priority === "string" && /^-?\d+$/.test(priority)
        ? Number(priority)
        : NaN,
  };
}

export function overrideFormInput(form: FormData): unknown {
  const saveRule = form.get("saveRule");
  const categoryId = form.has("categoryId")
    ? form.get("categoryId")
    : undefined;
  return {
    mode: form.get("mode"),
    categoryId:
      categoryId === "" || categoryId === "automatic" ? null : categoryId,
    ...(saveRule === "on" && { rule: ruleFormInput(form) }),
  };
}

export function rejectedForm(error: z.ZodError, form: FormData): FormState {
  const errors: FormState["errors"] = {};
  for (const issue of error.issues) {
    const field = String(
      issue.path[0] === "rule"
        ? (issue.path[1] ?? "form")
        : (issue.path[0] ?? "form"),
    );
    if (errors[field] === undefined) errors[field] = issue.message;
  }
  return { errors, values: formValues(form) };
}

export function formValues(form: FormData): NonNullable<FormState["values"]> {
  const values: NonNullable<FormState["values"]> = {};
  for (const name of [
    "pattern",
    "categoryId",
    "matchType",
    "priority",
    "saveRule",
    "mode",
    "name",
  ]) {
    const value = form.get(name);
    if (typeof value === "string") values[name] = value.slice(0, 500);
  }
  return values;
}

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a category name.")
  .max(60, "Use 60 characters or fewer.");
export const pageNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100_000)
  .catch(1);
