import { z } from "zod";
import { normalizeMerchant } from "@/features/categorization/client";
import { dateSchema, paymentInputSchema } from "@/features/recurring/client";
import { parseBalance, parseDollars } from "@/lib/money";

export type FormState = {
  errors: Record<string, string>;
  values?: Record<string, string>;
  message?: string;
};
export type FormAction = (
  state: FormState,
  form: FormData,
) => Promise<FormState>;
export const targetSchema = z.object({
  accountId: z.uuid(),
  merchant: z.string().min(1).max(500),
});
export const revisionSchema = z.number().int().min(0).max(2147483646);
const invoiceAmount = z
  .number()
  .int()
  .min(0, "Enter zero or a positive USD amount.")
  .max(10000000000)
  .nullable();
export const billInputSchema = paymentInputSchema.safeExtend({
  kind: z.literal("bill"),
  autopay: z.boolean(),
  liabilityAccountId: z.uuid().nullable(),
  invoiceCents: invoiceAmount,
});
export type BillInput = z.infer<typeof billInputSchema>;
export const invoiceInputSchema = z.object({
  dueOn: dateSchema,
  invoiceCents: invoiceAmount,
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
const FIELDS = [
  "accountId",
  "merchant",
  "name",
  "amountMode",
  "unit",
  "every",
  "amount",
  "nextOn",
  "useHistory",
  "autopay",
  "liabilityAccountId",
  "invoiceAmount",
  "dueOn",
  "transactionId",
  "confirmed",
];
export function formValues(form: FormData): Record<string, string> {
  return Object.fromEntries(
    FIELDS.map((key) => [
      key,
      typeof form.get(key) === "string"
        ? String(form.get(key)).slice(0, 2000)
        : "",
    ]),
  );
}
export function rejected(error: z.ZodError, form: FormData): FormState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[
      key === "amountCents"
        ? "amount"
        : key === "invoiceCents"
          ? "invoiceAmount"
          : key
    ] ??= issue.message;
  }
  return { errors, values: formValues(form) };
}
const invoiceValue = (value: string) =>
  value.trim() === "" ? null : (parseBalance(value) ?? Number.NaN);
export function parseBillForm(form: FormData) {
  const v = formValues(form);
  return billInputSchema.safeParse({
    ...v,
    kind: "bill",
    merchant: normalizeMerchant(v.merchant || v.name || ""),
    every: Number(v.every),
    amountCents: parseDollars(v.amount ?? ""),
    useHistory: v.useHistory === "on",
    autopay: v.autopay === "on",
    liabilityAccountId: v.liabilityAccountId || null,
    invoiceCents: invoiceValue(v.invoiceAmount ?? ""),
  });
}
export function parseInvoiceForm(form: FormData) {
  const v = formValues(form);
  return invoiceInputSchema.safeParse({
    dueOn: v.dueOn,
    invoiceCents: invoiceValue(v.invoiceAmount ?? ""),
  });
}
export const paymentInputSchemaForBills = z.object({
  transactionId: z.uuid(),
  confirmed: z.literal("on", {
    error: "Confirm that this transaction paid this bill.",
  }),
});
export const querySchema = z
  .object({
    view: z
      .enum(["upcoming", "soon", "review", "history", "archived"])
      .catch("upcoming"),
    account: z.uuid().optional().catch(undefined),
    page: z.coerce.number().int().min(1).max(1000).catch(1),
    paymentPage: z.coerce.number().int().min(1).max(1000).catch(1),
    historyPage: z.coerce.number().int().min(1).max(1000).catch(1),
    from: dateSchema.or(z.literal("")).optional(),
    to: dateSchema.or(z.literal("")).optional(),
    accountId: z.uuid().optional(),
    merchant: z.string().min(1).max(500).optional(),
    cycle: dateSchema.optional(),
  })
  .refine(
    (v) => Boolean(v.accountId) === Boolean(v.merchant),
    "Choose a bill account and payee together.",
  )
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "The end date must follow the start date.",
  );
export type BillsQuery = z.infer<typeof querySchema>;

export function billHref(
  workspaceId: string,
  accountId: string,
  merchant: string,
  cycle?: string,
): string {
  const query = new URLSearchParams({ accountId, merchant });
  if (cycle) query.set("cycle", cycle);
  return `/w/${encodeURIComponent(workspaceId)}/bills?${query.toString()}`;
}
