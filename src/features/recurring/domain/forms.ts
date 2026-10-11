import { z } from "zod";
import { normalizeMerchant } from "@/features/categorization/client";
import { parseDollars } from "@/lib/money";
import { dateSchema } from "./dates";
import { MAX_AMOUNT, merchantSchema } from "./patterns";

export const objectIdSchema = z.uuid();
export const targetSchema = z.object({
  accountId: objectIdSchema,
  merchant: merchantSchema,
});
export const paymentInputSchema = targetSchema
  .extend({
    name: z.string().trim().min(1, "Enter a payment name.").max(80),
    kind: z.enum(["bill", "subscription", "income"]),
    amountMode: z.enum(["fixed", "variable"]),
    unit: z.enum(["days", "months"]),
    every: z.number().int().min(1).max(730),
    amountCents: z
      .number({ error: "Enter a USD amount with at most two decimal places." })
      .int()
      .positive("Enter an amount greater than zero.")
      .max(MAX_AMOUNT, "Enter a smaller amount."),
    useHistory: z.boolean().default(false),
    nextOn: dateSchema,
  })
  .refine((value) => value.unit !== "months" || value.every <= 36, {
    path: ["every"],
    message: "Use 1–36 months.",
  });
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type FormState = {
  errors: Record<string, string>;
  values?: Record<string, string>;
};
export type FormAction = (
  state: FormState,
  form: FormData,
) => Promise<FormState>;
export const intentSchema = z.enum(["none", "keep", "cancel"]);
export const dispositionSchema = z.enum(["dismiss", "restore", "remove"]);

const FIELDS = [
  "accountId",
  "merchant",
  "name",
  "kind",
  "amountMode",
  "unit",
  "every",
  "amount",
  "nextOn",
  "intent",
  "disposition",
  "useHistory",
];
export function formValues(form: FormData): Record<string, string> {
  return Object.fromEntries(
    FIELDS.map((name) => [
      name,
      typeof form.get(name) === "string"
        ? String(form.get(name)).slice(0, 2000)
        : "",
    ]),
  );
}
export function parsePaymentForm(form: FormData) {
  const values = formValues(form);
  return paymentInputSchema.safeParse({
    ...values,
    merchant: normalizeMerchant(values.merchant ?? ""),
    every: Number(values.every),
    amountCents: parseDollars(values.amount ?? ""),
    useHistory: values.useHistory === "on",
  });
}
export function rejectedForm(error: z.ZodError, form: FormData): FormState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues)
    errors[
      issue.path[0] === "amountCents"
        ? "amount"
        : String(issue.path[0] ?? "form")
    ] ??= issue.message;
  return { errors, values: formValues(form) };
}
export const querySchema = z.object({
  kind: z.enum(["all", "bill", "subscription", "income"]).catch("all"),
  state: z.enum(["all", "confirmed", "candidate", "dismissed"]).catch("all"),
  intent: intentSchema.or(z.literal("all")).catch("all"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  account: objectIdSchema.optional().catch(undefined),
});
