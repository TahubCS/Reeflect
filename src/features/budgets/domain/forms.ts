import { z } from "zod";
import { type Cents, parseBalance } from "@/lib/money";
import { monthSchema } from "./months";

export const MAX_BUDGET_CENTS = 10_000_000_000;
export const targetSchema = z.object({
  month: monthSchema,
  categoryId: z.uuid(),
});
export const amountSchema = z.number().int().min(0).max(MAX_BUDGET_CENTS);
export type BudgetInput = z.infer<typeof targetSchema> & { amountCents: Cents };
export type FormState = {
  errors: Partial<Record<"amount" | "form", string>>;
  amount?: string;
  message?: string;
};
export type FormAction = (
  state: FormState,
  form: FormData,
) => Promise<FormState>;

export function parseBudgetAmount(
  form: FormData,
): { ok: true; amountCents: Cents } | { ok: false; state: FormState } {
  const raw = form.get("amount");
  const amount = typeof raw === "string" ? raw.trim() : "";
  const value = parseBalance(amount);
  if (value !== null && amountSchema.safeParse(value).success)
    return { ok: true, amountCents: value };
  return {
    ok: false,
    state: {
      errors: {
        amount:
          "Enter a USD amount from $0 to $100,000,000, with at most two decimal places.",
      },
      amount: amount.slice(0, 100),
    },
  };
}

/** Stable preset keys survive category renames (ADR-055, ADR-057). */
export function isSpendingCategory(presetKey: string): boolean {
  return !["income", "retirement", "investing"].includes(presetKey);
}
