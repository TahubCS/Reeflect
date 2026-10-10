// The population spec (ADR-049): who the synthetic people are. An agent
// writes it by following docs/SYNTHETIC.md; this schema is the source of
// truth for its shape. Amounts are integer cents, always positive here; the
// expander applies the signs (ADR-008).
import { z } from "zod";
import { isRealDate } from "./calendar";

export const SPEC_VERSION = 1;

export const PERSONAS = [
  "paycheck_to_paycheck",
  "hourly_gig",
  "student",
  "salaried_middle",
  "upper_middle_tech",
  "retiree",
  "single_parent",
] as const;
export type Persona = (typeof PERSONAS)[number];

export const SPENDING_CATEGORIES = [
  "Groceries",
  "Eating out",
  "Coffee",
  "Transport",
  "Shopping",
  "Fun",
  "Health",
  "Travel",
  "Personal care",
  "Kids",
  "Gifts",
  "Other",
] as const;

export const BILL_CATEGORIES = [
  "Housing",
  "Utilities",
  "Phone & internet",
  "Insurance",
  "Loans",
  "Childcare",
  "Education",
] as const;

/** Categories the expander writes itself, never chosen in a spec. */
export const SYSTEM_CATEGORIES = [
  "Pay",
  "Subscriptions",
  "Transfers",
  "Interest",
] as const;

export const CATEGORIES = [
  ...SPENDING_CATEGORIES,
  ...BILL_CATEGORIES,
  ...SYSTEM_CATEGORIES,
] as const;
export type Category = (typeof CATEGORIES)[number];

const MAX_AMOUNT = 1_000_000_00; // $1,000,000.00: anything larger is a typo

const amount = z.number().int().min(1).max(MAX_AMOUNT);
const balance = z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT);
const dayOfMonth = z.number().int().min(1).max(31);
const weekday = z.number().int().min(0).max(6); // 0 = Sunday
const percent = z.number().int().min(0).max(100);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .refine(isRealDate, "must be a real date");
const yearMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be YYYY-MM");
const text = (max: number) => z.string().trim().min(1).max(max);

function range(inner: z.ZodNumber) {
  return z
    .object({ min: inner, max: inner })
    .refine((r) => r.min <= r.max, "min must not be more than max");
}

const accountRef = z.enum(["checking", "card"]);

/** When income arrives. Paydays on a weekend move to the Friday before. */
const schedule = z.discriminatedUnion("every", [
  z.object({ every: z.literal("week"), weekday }),
  /** Every 14 days, in step with `anchor` (any one payday, even outside the span). */
  z.object({ every: z.literal("two_weeks"), anchor: isoDate }),
  z.object({
    every: z.literal("half_month"),
    days: z.tuple([dayOfMonth, dayOfMonth]),
  }),
  z.object({ every: z.literal("month"), day: dayOfMonth }),
  /** E.g. Social Security on the second Wednesday: `{ nth: 2, weekday: 3 }`. */
  z.object({
    every: z.literal("month_weekday"),
    nth: z.number().int().min(1).max(4),
    weekday,
  }),
  /** Gig work: a random number of deposits on random days each month. */
  z.object({
    every: z.literal("irregular"),
    perMonth: range(z.number().int().min(0).max(31)),
  }),
]);
export type Schedule = z.infer<typeof schedule>;

const income = z.object({
  /** As it reads on a statement, e.g. "ACME CORP PAYROLL". */
  payer: text(60),
  /** Take-home amount of one deposit. */
  amountCents: amount,
  /** Each deposit varies by up to ± this percent (0 = identical every time). */
  variationPct: z.number().int().min(0).max(50).default(0),
  schedule,
});

const recurringBase = {
  name: text(60),
  amountCents: amount,
  /** Due day; 29–31 fall on the last day of shorter months (ADR-030). */
  day: dayOfMonth,
  account: accountRef.default("checking"),
  variationPct: z.number().int().min(0).max(50).default(0),
  cadence: z.enum(["monthly", "yearly"]).default("monthly"),
  /** For yearly items: the month it is charged, 1–12. */
  month: z.number().int().min(1).max(12).optional(),
};

const bill = z.object({
  ...recurringBase,
  category: z.enum(BILL_CATEGORIES),
});

const subscription = z.object(recurringBase);

const spending = z.object({
  category: z.enum(SPENDING_CATEGORIES),
  merchants: z.array(text(60)).min(1).max(12),
  perMonth: range(z.number().int().min(0).max(120)),
  amountCents: range(amount),
  /** Percent of these purchases put on the card (needs a card). */
  cardShare: percent.default(0),
});

const event = z.object({
  date: isoDate,
  description: text(60),
  /** Signed from the account holder's view: positive = money in. */
  amountCents: balance.refine((v) => v !== 0, "must not be zero"),
  account: accountRef.default("checking"),
  category: z.enum(CATEGORIES),
});

const cardPayment = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("full") }),
  /** The larger of $25 and 2% of the statement balance. */
  z.object({ kind: z.literal("minimum") }),
  z.object({ kind: z.literal("fixed"), amountCents: amount }),
]);

const accounts = z.object({
  checking: z.object({ openingBalanceCents: balance }),
  savings: z
    .object({
      openingBalanceCents: z.number().int().min(0).max(MAX_AMOUNT),
      monthlyTransferCents: z.number().int().min(0).max(MAX_AMOUNT),
      transferDay: dayOfMonth,
    })
    .optional(),
  card: z
    .object({
      /** Owed at the start, as a negative balance (ADR-008); 0 when paid off. */
      openingBalanceCents: z.number().int().min(-MAX_AMOUNT).max(0),
      /** APR in basis points: 2499 = 24.99%. Charged on balances carried over. */
      aprBps: z.number().int().min(0).max(4000),
      payment: cardPayment,
      paymentDay: dayOfMonth,
    })
    .optional(),
});

const person = z
  .object({
    /** Unique within the spec: lowercase letters, digits and dashes. */
    key: z.string().regex(/^[a-z0-9-]{1,32}$/, "must be a short slug"),
    /** Invented. Never a real person (ADR-033, TEST-08). */
    name: text(60),
    persona: z.enum(PERSONAS),
    /** One line a reviewer can scan. */
    summary: text(200),
    accounts,
    income: z.array(income).max(4),
    bills: z.array(bill).max(20),
    subscriptions: z.array(subscription).max(30),
    spending: z.array(spending).max(20),
    events: z.array(event).max(50).default([]),
  })
  .superRefine((p, ctx) => {
    const usesCard =
      p.bills.some((b) => b.account === "card") ||
      p.subscriptions.some((s) => s.account === "card") ||
      p.spending.some((s) => s.cardShare > 0) ||
      p.events.some((e) => e.account === "card");
    if (usesCard && !p.accounts.card) {
      ctx.addIssue({
        code: "custom",
        message: "uses the card but has no card account",
        path: ["accounts", "card"],
      });
    }
    for (const [list, items] of [
      ["bills", p.bills],
      ["subscriptions", p.subscriptions],
    ] as const) {
      items.forEach((item, i) => {
        if (item.cadence === "yearly" && item.month === undefined) {
          ctx.addIssue({
            code: "custom",
            message: "a yearly item needs its month",
            path: [list, i, "month"],
          });
        }
      });
    }
  });

export const specSchema = z
  .object({
    version: z.literal(SPEC_VERSION),
    label: text(80),
    /** The developer's request, word for word, for the record. */
    request: z.string().max(2000).optional(),
    startMonth: yearMonth,
    months: z.number().int().min(1).max(36),
    /** Nothing after this date is generated. The loader fills in today. */
    asOf: isoDate.optional(),
    people: z.array(person).min(1).max(1000),
  })
  .superRefine((spec, ctx) => {
    const seen = new Set<string>();
    spec.people.forEach((p, i) => {
      if (seen.has(p.key)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate person key "${p.key}"`,
          path: ["people", i, "key"],
        });
      }
      seen.add(p.key);
    });
    if (spec.asOf !== undefined && spec.asOf < `${spec.startMonth}-01`) {
      ctx.addIssue({
        code: "custom",
        message: "asOf is before the span starts",
        path: ["asOf"],
      });
    }
  });

/** The spec as written (defaults optional). */
export type SpecInput = z.input<typeof specSchema>;
/** The spec after validation (defaults filled in). */
export type Spec = z.output<typeof specSchema>;
export type PersonSpec = Spec["people"][number];

export type SpecResult =
  { ok: true; spec: Spec } | { ok: false; problems: string[] };

/** Validates a spec, returning readable problems ("people.3.income.0.amountCents: …"). */
export function parseSpec(input: unknown): SpecResult {
  const result = specSchema.safeParse(input);
  if (result.success) return { ok: true, spec: result.data };
  return {
    ok: false,
    problems: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(spec)"}: ${issue.message}`,
    ),
  };
}
