import { z } from "zod";
import { isIsoDate } from "@/features/transactions";
import { type Cents, negate, parseDollars } from "@/lib/money";

// Money the person expects on a later day (F-37, ADR-102): what the calendar's
// day panel sends, and the shape the server hands back. Plain TypeScript, so
// the server actions and the calendar share it. A plan is not a transaction:
// it only ever shows on the calendar.

/** A plan as the calendar reads it. */
export type PlannedSummary = {
  id: string;
  accountId: string;
  /** "YYYY-MM-DD". */
  plannedOn: string;
  /** Signed per ADR-008: negative is money out of the account. */
  amountCents: Cents;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryPresetKey: string | null;
};

export type PlanInput = {
  accountId: string;
  plannedOn: string;
  amountCents: Cents;
  description: string;
  /** Null lets the saved rules choose once it is confirmed (ADR-013). */
  categoryId: string | null;
};

/** Our plan ids are UUID v7 (ARCH-03). */
export const planIdSchema = z.uuid();

export const PLAN_FIELDS = [
  "accountId",
  "plannedOn",
  "direction",
  "amount",
  "description",
  "categoryId",
] as const;

export type PlanField = (typeof PLAN_FIELDS)[number];

export type ParsedPlan =
  | { readonly ok: true; readonly value: PlanInput }
  | { readonly ok: false; readonly errors: Partial<Record<PlanField, string>> };

const DESCRIPTION = "Say what it is, like “Rent” or “Birthday gift”.";

const planSchema = z.object({
  accountId: z.uuid("Choose an account."),
  direction: z.enum(["out", "in"], { error: "Choose money out or money in." }),
  description: z
    .string(DESCRIPTION)
    .trim()
    .min(1, DESCRIPTION)
    .max(200, "Use 200 characters or fewer."),
  categoryId: z.uuid("Choose one of your categories.").nullable(),
});

const isPlanField = (name: unknown): name is PlanField =>
  (PLAN_FIELDS as readonly unknown[]).includes(name);

function readText(raw: unknown, name: PlanField): string {
  if (typeof raw === "object" && raw !== null && name in raw) {
    const value = (raw as Record<string, unknown>)[name];
    return typeof value === "string" ? value.trim() : "";
  }
  return "";
}

/**
 * Checks a plan from the day panel. The date is after `today` (the day the
 * person is in, "YYYY-MM-DD" in `DEFAULT_TIME_ZONE`) and no later than
 * `lastDay`, the calendar's last day, so a plan never lands where nobody can
 * see it. The amount is plain with a "money out / money in" choice and kept
 * signed (ADR-008).
 */
export function parsePlanForm(
  raw: unknown,
  options: { today: string; lastDay: string },
): ParsedPlan {
  const errors: Partial<Record<PlanField, string>> = {};
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (isPlanField(field)) errors[field] ??= issue.message;
    }
  }

  const plannedOn = readText(raw, "plannedOn");
  if (!isIsoDate(plannedOn)) errors.plannedOn = "Enter a date.";
  else if (plannedOn <= options.today) {
    errors.plannedOn = "Choose a day after today.";
  } else if (plannedOn > options.lastDay) {
    errors.plannedOn = "Choose a day the calendar shows.";
  }

  const amount = parseDollars(readText(raw, "amount"));
  if (amount === null)
    errors.amount = "Enter an amount above zero, like 12.50.";

  if (!parsed.success || amount === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const { accountId, direction, description, categoryId } = parsed.data;
  return {
    ok: true,
    value: {
      accountId,
      plannedOn,
      amountCents: direction === "out" ? negate(amount) : amount,
      description,
      // Money in has no spending category.
      categoryId: direction === "in" ? null : categoryId,
    },
  };
}
