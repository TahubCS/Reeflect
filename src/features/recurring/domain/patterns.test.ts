import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import {
  HISTORY_DAYS,
  MAX_AMOUNT,
  MAX_CHARGES,
  findPatterns,
  groupCharges,
  typicalAmounts,
  type Charge,
} from "./patterns";
import {
  buildPayments,
  summarizePayments,
  annualCost,
  type SavedPayment,
} from "./payments";
import {
  cadenceLabel,
  dateSchema,
  daysBetween,
  median,
  nextAfter,
  shiftDays,
  shiftMonths,
} from "./dates";
import {
  dispositionSchema,
  formValues,
  intentSchema,
  parsePaymentForm,
  querySchema,
  rejectedForm,
  targetSchema,
} from "./forms";

const ACCOUNT = "019b6549-0123-7123-8123-123456789abc";
const SECOND = "019b6549-0123-7123-8123-123456789abd";
const TODAY = "2026-10-11";
const charge = (
  postedOn: string,
  amountCents = -1599,
  extra: Partial<Charge> = {},
): Charge => ({
  id: crypto.randomUUID(),
  accountId: ACCOUNT,
  descriptionRaw: "Stream Service REF ABC123",
  postedOn,
  amountCents,
  status: "posted",
  isTransfer: false,
  categoryKey: null,
  source: "csv",
  ...extra,
});
const monthly = () => [
  charge("2026-08-01"),
  charge("2026-09-01"),
  charge("2026-10-01"),
];
const saved = (extra: Partial<SavedPayment> = {}): SavedPayment => ({
  id: crypto.randomUUID(),
  accountId: ACCOUNT,
  merchant: "stream service",
  name: "Streaming",
  decision: "confirmed",
  kind: "subscription",
  amountMode: "fixed",
  unit: "months",
  every: 1,
  amountCents: null,
  baselineAmountCents: 1599,
  nextOn: null,
  manual: false,
  userIntent: "none",
  ...extra,
});

describe("payment pattern evidence", () => {
  it("learns a calendar-month pattern and conservatively normalizes references", () => {
    const result = findPatterns(monthly(), TODAY)[0]!;
    expect(result).toMatchObject({
      merchant: "stream service",
      unit: "months",
      every: 1,
      amountMode: "fixed",
      typical: 1599,
      nextOn: "2026-11-01",
      sampleCount: 3,
      kind: "subscription",
    });
  });
  it("finds variable electricity charges without an amount-tolerance gate", () => {
    const input = [-9500, -13000, -11000].map((amount, i) =>
      charge(`2026-${String(i + 8).padStart(2, "0")}-01`, amount, {
        descriptionRaw: "City Electric",
        categoryKey: "utilities",
      }),
    );
    expect(findPatterns(input, TODAY)[0]).toMatchObject({
      kind: "bill",
      amountMode: "variable",
      typical: 11000,
      low: 9500,
      high: 13000,
    });
  });
  it.each([
    [["2026-09-13", "2026-09-27", "2026-10-11"], "days", 14],
    [["2026-09-27", "2026-10-04", "2026-10-11"], "days", 7],
    [["2026-04-01", "2026-07-01", "2026-10-01"], "months", 3],
    [["2024-10-01", "2025-10-01", "2026-10-01"], "months", 12],
    [["2026-08-12", "2026-09-09", "2026-10-07"], "days", 28],
  ] as const)(
    "infers %j without a monthly/weekly whitelist",
    (dates, unit, every) => {
      expect(
        findPatterns(
          dates.map((date) => charge(date)),
          TODAY,
        )[0],
      ).toMatchObject({ unit, every });
    },
  );
  it("tolerates ordinary billing-date jitter", () => {
    expect(
      findPatterns(
        [charge("2026-08-10"), charge("2026-09-12"), charge("2026-10-09")],
        TODAY,
      ),
    ).toHaveLength(1);
  });
  it("retains month-end anchors across short months", () => {
    expect(
      findPatterns(
        [charge("2026-01-31"), charge("2026-02-28"), charge("2026-03-31")],
        "2026-04-01",
      )[0]?.nextOn,
    ).toBe("2026-04-30");
  });
  it("does not cherry-pick irregular grocery visits", () => {
    expect(
      findPatterns(
        [
          charge("2026-09-01"),
          charge("2026-09-03"),
          charge("2026-09-24"),
          charge("2026-10-01"),
        ],
        TODAY,
      ),
    ).toEqual([]);
  });
  it.each(
    [
      [],
      [charge("2026-10-01")],
      [charge("2026-09-01"), charge("2026-10-01")],
    ].map((input) => ({ input })),
  )("requires enough evidence", ({ input }) =>
    expect(findPatterns(input, TODAY)).toEqual([]),
  );
  it.each(
    [
      [charge("2026-10-01"), charge("2026-10-01"), charge("2026-10-08")],
      [charge("2026-10-01"), charge("2026-10-02"), charge("2026-10-03")],
      [charge("2026-01-01"), charge("2026-02-01"), charge("2026-03-01")],
      [
        charge("2026-08-01"),
        charge("2026-08-31"),
        charge("2026-10-10"),
        charge("2026-10-11"),
      ],
    ].map((input) => ({ input })),
  )(
    "rejects ambiguity, everyday activity, stale and inconsistent evidence",
    ({ input }) => expect(findPatterns(input, TODAY)).toEqual([]),
  );
  it.each([
    { status: "pending" as const },
    { isTransfer: true },
    { amountCents: 1599 },
    { amountCents: 0 },
    { postedOn: "2026-11-01" },
    { postedOn: shiftDays(TODAY, -HISTORY_DAYS - 1) },
    { descriptionRaw: " " },
    { descriptionRaw: "x".repeat(501) },
    { descriptionRaw: "x".repeat(2001) },
  ])("excludes ineligible evidence %j", (extra) => {
    const input = monthly();
    input[1] = { ...input[1]!, ...extra };
    expect(findPatterns(input, TODAY)).toEqual([]);
  });
  it("keeps accounts separate and inputs unchanged", () => {
    const input = monthly();
    input[1]!.accountId = SECOND;
    const before = structuredClone(input);
    expect(findPatterns(input.reverse(), TODAY)).toEqual([]);
    expect([...input].reverse()).toEqual(before);
  });
  it("rounds an even-sample typical amount through cents helpers", () => {
    expect(
      typicalAmounts([charge("2026-09-01", -100), charge("2026-10-01", -101)])
        .typical,
    ).toBe(101);
  });
  it("checks malformed input and explicit processing bounds", () => {
    expect(() => findPatterns([charge("2026-02-30")], TODAY)).toThrow();
    expect(() => findPatterns([charge("2026-10-01", -0.1)], TODAY)).toThrow();
    expect(() =>
      groupCharges(
        Array.from({ length: MAX_CHARGES + 1 }, () => charge(TODAY)),
        TODAY,
      ),
    ).toThrow();
  });
});

describe("confirmed costs and ledger activity", () => {
  it("requires confirmation for every suggestion", () => {
    const result = buildPayments(monthly(), [], TODAY);
    expect(result[0]?.decision).toBe("candidate");
    expect(summarizePayments(result)).toMatchObject({
      yearly: 0,
      actual: 0,
      candidates: 1,
    });
  });
  it("calculates confirmed monthly costs and actual posted activity separately", () => {
    expect(
      summarizePayments(buildPayments(monthly(), [saved()], TODAY)),
    ).toMatchObject({
      monthly: 1599,
      yearly: 19188,
      actual: 1599,
      count: 1,
      bills: 0,
      subscriptions: 1599,
    });
  });
  it("planning to cancel saves an intention and does not reduce current costs", () => {
    expect(
      summarizePayments(
        buildPayments(monthly(), [saved({ userIntent: "cancel" })], TODAY),
      ),
    ).toMatchObject({ monthly: 1599, saving: 19188 });
  });
  it("subtracts refunds from actual activity without treating them as evidence", () => {
    const input = [
      ...monthly(),
      charge("2026-10-05", 200),
      charge("2026-10-06", 300, { isTransfer: true }),
      charge("2026-10-07", 100, { status: "pending" }),
      charge("2026-11-01", 999),
    ];
    expect(buildPayments(input, [saved()], TODAY)[0]?.actual).toBe(1399);
    expect(findPatterns(input, TODAY)[0]?.charges).toHaveLength(3);
  });
  it("never puts bills in subscription cancellation savings", () => {
    const result = buildPayments(
      monthly(),
      [saved({ kind: "bill", userIntent: "cancel" })],
      TODAY,
    );
    expect(result[0]?.userIntent).toBe("none");
    expect(summarizePayments(result)).toMatchObject({
      bills: 1599,
      subscriptions: 0,
      saving: 0,
    });
  });
  it("updates variable estimates while preserving user classification", () => {
    const input = monthly();
    input[0]!.amountCents = -9500;
    input[1]!.amountCents = -13000;
    input[2]!.amountCents = -11000;
    expect(
      buildPayments(
        input,
        [
          saved({
            kind: "bill",
            amountMode: "variable",
            baselineAmountCents: 9500,
          }),
        ],
        TODAY,
      )[0],
    ).toMatchObject({
      amount: 11000,
      priceChanged: false,
      low: 9500,
      high: 13000,
    });
  });
  it("flags a changed fixed charge even if the amount variation is large", () => {
    const input = monthly();
    input[2]!.amountCents = -4000;
    expect(buildPayments(input, [saved()], TODAY)[0]).toMatchObject({
      amount: 4000,
      previousAmount: 1599,
      priceChanged: true,
    });
  });
  it("preserves an entered estimate and rolls its date after a matching charge", () => {
    expect(
      buildPayments(
        monthly(),
        [saved({ amountCents: 2000, nextOn: "2026-09-01", manual: true })],
        TODAY,
      )[0],
    ).toMatchObject({ amount: 2000, nextOn: "2026-11-01", dateSource: "user" });
  });
  it("retains an unpassed user date and a manual bill without history", () => {
    const result = buildPayments(
      [],
      [
        saved({
          kind: "bill",
          manual: true,
          nextOn: "2026-11-15",
          amountCents: 130000,
        }),
      ],
      TODAY,
    );
    expect(result[0]).toMatchObject({
      amount: 130000,
      nextOn: "2026-11-15",
      active: true,
      sampleCount: 0,
      lastOn: null,
    });
  });
  it("keeps a due date in the past until evidence of payment exists", () =>
    expect(
      buildPayments(
        [],
        [saved({ manual: true, nextOn: "2026-10-01" })],
        TODAY,
      )[0]?.nextOn,
    ).toBe("2026-10-01"));
  it("removes stale detected payments from estimates but retains choices", () => {
    const result = buildPayments([], [saved({ userIntent: "keep" })], TODAY);
    expect(result[0]).toMatchObject({
      active: false,
      userIntent: "keep",
      nextOn: null,
    });
    expect(summarizePayments(result).yearly).toBe(0);
  });
  it("does not resurrect dismissed choices or orphaned stored candidates", () => {
    expect(
      summarizePayments(
        buildPayments(monthly(), [saved({ decision: "dismissed" })], TODAY),
      ),
    ).toMatchObject({ count: 0, yearly: 0 });
    expect(
      buildPayments([], [saved({ decision: "candidate" })], TODAY),
    ).toEqual([]);
  });
  it("keeps unconfirmed inference fresh when later charges change amount behavior", () => {
    const input = monthly().map((row, i) => ({
      ...row,
      amountCents: [-1000, -3000, -2000][i]!,
    }));
    expect(
      buildPayments(
        input,
        [saved({ decision: "candidate", amountMode: "fixed" })],
        TODAY,
      )[0],
    ).toMatchObject({ amountMode: "variable", amount: 2000, useHistory: true });
  });
  it("preserves the chosen estimate source independently of amount behavior", () => {
    expect(
      buildPayments(
        monthly(),
        [saved({ amountMode: "variable", amountCents: 2000 })],
        TODAY,
      )[0],
    ).toMatchObject({ useHistory: false, amount: 2000 });
    expect(
      buildPayments(
        monthly(),
        [saved({ amountMode: "fixed", amountCents: null })],
        TODAY,
      )[0]?.useHistory,
    ).toBe(true);
  });
  it("keeps maximum supported daily estimates safe across a full workspace", () => {
    const payments = buildPayments(
      [],
      Array.from({ length: 1000 }, (_, i) =>
        saved({
          merchant: `payee ${i}`,
          manual: true,
          unit: "days",
          every: 1,
          amountCents: MAX_AMOUNT,
          baselineAmountCents: MAX_AMOUNT,
          nextOn: "2026-11-01",
        }),
      ),
      TODAY,
    );
    expect(summarizePayments(payments).yearly).toBe(3_650_000_000_000_000);
    expect(Number.isSafeInteger(summarizePayments(payments).monthly)).toBe(
      true,
    );
  });
  it("estimates interval schedules from their inferred cadence", () => {
    expect(annualCost(cents(100), "days", 14)).toBe(2607);
    expect(annualCost(cents(100), "months", 3)).toBe(400);
    expect(
      buildPayments(
        [charge("2026-09-13"), charge("2026-09-27"), charge("2026-10-11")],
        [],
        TODAY,
      )[0]?.nextOn,
    ).toBe("2026-10-25");
  });
  it("sorts independently of source order and account duplicates", () => {
    const rows = [
      saved({ accountId: SECOND, name: "A bill", manual: true }),
      saved({ name: "A bill", manual: true }),
    ];
    expect(buildPayments([], rows, TODAY)).toEqual(
      buildPayments([], [...rows].reverse(), TODAY),
    );
  });
});

describe("date and form boundaries", () => {
  it.each(["2026-02-29", "2026-13-01", "no date", "1800-01-01"])(
    "rejects %s",
    (input) => expect(dateSchema.safeParse(input).success).toBe(false),
  );
  it("clamps leap-year month ends without losing the anchor", () => {
    expect(shiftMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(nextAfter("2026-01-31", "months", 1, "2026-02-28")).toBe(
      "2026-03-31",
    );
    expect(nextAfter("2026-10-01", "days", 7, "2026-10-11")).toBe("2026-10-15");
    expect(nextAfter("2026-12-01", "months", 1, TODAY)).toBe("2026-12-01");
    expect(nextAfter("2026-01-01", "months", 1, "2026-04-15")).toBe(
      "2026-05-01",
    );
    expect(daysBetween("2026-10-01", "2026-10-11")).toBe(10);
    expect(median([4, 2, 3])).toBe(3);
  });
  it.each([
    ["days", 7, "Weekly"],
    ["days", 14, "Every two weeks"],
    ["days", 20, "Every 20 days"],
    ["months", 1, "Monthly"],
    ["months", 3, "Quarterly"],
    ["months", 12, "Yearly"],
    ["months", 2, "Every 2 months"],
  ] as const)("labels an inferred cadence", (unit, every, expected) =>
    expect(cadenceLabel(unit, every)).toBe(expected),
  );
  it("validates manual entries, normalizes payees, and retains invalid input", () => {
    const form = new FormData();
    for (const [name, value] of Object.entries({
      accountId: ACCOUNT,
      merchant: "City Electric REF ABC123",
      name: "Electricity",
      kind: "bill",
      amountMode: "variable",
      amount: "$110.00",
      unit: "months",
      every: "1",
      nextOn: "2026-11-01",
      useHistory: "on",
    }))
      form.set(name, value);
    const good = parsePaymentForm(form);
    expect(good.success && good.data).toMatchObject({
      merchant: "city electric",
      amountCents: 11000,
      useHistory: true,
    });
    form.set("nextOn", "2026-02-30");
    form.set("every", "37");
    form.set("amount", "nonsense");
    const bad = parsePaymentForm(form);
    expect(bad.success).toBe(false);
    if (!bad.success)
      expect(rejectedForm(bad.error, form)).toMatchObject({
        values: { amount: "nonsense" },
        errors: {
          amount: expect.any(String),
          nextOn: expect.any(String),
        },
      });
    form.set("amount", "110");
    form.set("nextOn", "2026-11-01");
    const badSchedule = parsePaymentForm(form);
    expect(badSchedule.success).toBe(false);
    if (!badSchedule.success)
      expect(rejectedForm(badSchedule.error, form).errors.every).toBeDefined();
    form.set("name", new Blob(["bad"]));
    expect(formValues(form).name).toBe("");
  });
  it("handles malformed filters and rejects arbitrary object IDs/choices", () => {
    expect(
      querySchema.parse({
        page: "nonsense",
        state: "bad",
        kind: "bad",
        intent: "bad",
        account: "foreign",
      }),
    ).toMatchObject({ page: 1, state: "all", kind: "all", intent: "all" });
    expect(
      targetSchema.safeParse({ accountId: "bad", merchant: "" }).success,
    ).toBe(false);
    expect(
      intentSchema.safeParse("cancel subscription externally").success,
    ).toBe(false);
    expect(dispositionSchema.safeParse("delete account").success).toBe(false);
    expect(parsePaymentForm(new FormData()).success).toBe(false);
  });
});
