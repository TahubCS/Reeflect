import { describe, expect, it } from "vitest";
import { buildPayments, type Payment } from "@/features/recurring/client";
import {
  coverage,
  cycleOffset,
  cycleState,
  isScheduledDate,
  isSettled,
  paymentEligible,
  projectedCycles,
  scheduledDate,
  type CycleFact,
  type EvidenceFact,
  type PostedFact,
} from "./cycles";

const TODAY = "2026-10-11";
const schedule = { anchorOn: "2026-10-11", unit: "months" as const, every: 1 };
const payment = (extra: Partial<Payment> = {}): Payment => ({
  ...buildPayments(
    [],
    [
      {
        id: "bill",
        accountId: "account",
        merchant: "electric",
        name: "Electric",
        decision: "confirmed",
        kind: "bill",
        amountMode: "variable",
        unit: "months",
        every: 1,
        amountCents: 14500,
        baselineAmountCents: 14500,
        nextOn: TODAY,
        manual: true,
        userIntent: "none",
      },
    ],
    TODAY,
  )[0]!,
  ...extra,
});
const fact = (extra: Partial<CycleFact> = {}): CycleFact => ({
  id: "cycle",
  scheduledOn: TODAY,
  dueOn: TODAY,
  dateSource: "user",
  invoiceCents: 18400,
  estimateCents: 14500,
  markedPaid: false,
  revision: 1,
  ...extra,
});
const posted = (extra: Partial<PostedFact> = {}): PostedFact => ({
  id: "tx",
  accountId: "account",
  amountCents: -10000,
  postedOn: TODAY,
  description: "Electric",
  status: "posted",
  isTransfer: false,
  ...extra,
});
const evidence = (extra: Partial<EvidenceFact> = {}): EvidenceFact => ({
  id: "link",
  originalTransactionId: "tx",
  transactionId: "tx",
  accountId: "account",
  amountCents: 10000,
  postedOn: TODAY,
  description: "Electric",
  isTransfer: false,
  ...extra,
});
const state = (
  cycle = fact(),
  links: EvidenceFact[] = [],
  rows: PostedFact[] = [],
) => cycleState(cycle, links, new Map(rows.map((r) => [r.id, r])), TODAY);

describe("stable bill cycles", () => {
  it.each([2024, 2026])(
    "preserves January 31 across February in %s",
    (year) => {
      const s = { ...schedule, anchorOn: `${year}-01-31` };
      expect(scheduledDate(s, 1)).toBe(`${year}-02-${year === 2024 ? 29 : 28}`);
      expect(scheduledDate(s, 2)).toBe(`${year}-03-31`);
      expect(isScheduledDate(s, `${year}-03-30`)).toBe(false);
      expect(isScheduledDate(s, scheduledDate(s, 1))).toBe(true);
      expect(cycleOffset(s, `${year}-03-31`)).toBe(2);
    },
  );
  it("handles fortnightly and quarterly schedules, including negative offsets", () => {
    const fortnight = { ...schedule, unit: "days" as const, every: 14 };
    expect(scheduledDate(fortnight, -1)).toBe("2026-09-27");
    expect(cycleOffset(fortnight, "2026-10-25")).toBe(1);
    expect(isScheduledDate(fortnight, "2026-10-24")).toBe(false);
    expect(scheduledDate({ ...schedule, every: 3 }, 1)).toBe("2027-01-11");
  });
  it("projects a bounded horizon without manufacturing old unpaid invoices", () => {
    const cycles = projectedCycles(
      payment({ nextOn: "2025-01-31" }),
      { anchorOn: "2025-01-31", dateSource: "user" },
      [],
      TODAY,
    );
    expect(cycles.map((c) => c.scheduledOn)).toEqual([
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
    ]);
    expect(
      cycles.every(
        (c) => c.invoiceCents === null && c.id === null && c.revision === 0,
      ),
    ).toBe(true);
    expect(
      projectedCycles(
        payment({ unit: "days", nextOn: TODAY }),
        null,
        [],
        TODAY,
      ),
    ).toHaveLength(91);
  });
  it("retains a corrected invoice's identity and never mutates saved facts", () => {
    const saved = [
      fact({ dueOn: "2026-10-15" }),
      fact({ id: "past", scheduledOn: "2026-09-11", dueOn: "2026-09-12" }),
    ];
    const before = structuredClone(saved);
    const result = projectedCycles(payment(), null, saved, TODAY);
    expect(result.filter((c) => c.scheduledOn === TODAY)).toEqual([saved[0]]);
    expect(result[0]!.id).toBe("past");
    expect(saved).toEqual(before);
    expect(result.find((c) => c.id === null)?.dateSource).toBe("predicted");
  });
  it.each([
    { decision: "candidate" as const },
    { decision: "dismissed" as const },
    { kind: "income" as const },
    { active: false },
    { nextOn: null },
  ])("retains only saved history for an unprojectable schedule %j", (extra) => {
    expect(projectedCycles(payment(extra), null, [fact()], TODAY)).toEqual([
      fact(),
    ]);
  });
  it("keeps explicit anchored schedules and stops at the supported date boundary", () => {
    expect(
      projectedCycles(
        payment({ active: false }),
        { anchorOn: TODAY, dateSource: "user" },
        [],
        TODAY,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      projectedCycles(
        payment({ nextOn: "2199-12-31" }),
        null,
        [],
        "2199-12-30",
      ),
    ).toHaveLength(1);
  });
});

describe("explicit posted-payment evidence", () => {
  it("accepts variable amounts and explicit repayment transfers without an amount tolerance", () => {
    expect(
      paymentEligible(
        payment(),
        posted({ amountCents: -123 }),
        schedule,
        TODAY,
        TODAY,
        false,
      ),
    ).toBe(true);
    expect(
      paymentEligible(
        payment(),
        posted({ isTransfer: true }),
        schedule,
        TODAY,
        TODAY,
        true,
      ),
    ).toBe(true);
  });
  it.each([
    { accountId: "foreign" },
    { status: "pending" as const },
    { amountCents: 100 },
    { amountCents: 0 },
    { amountCents: -10000000001 },
    { postedOn: "2026-10-12" },
    { postedOn: "2026-09-11" },
    { postedOn: "2026-11-11" },
    { isTransfer: true },
    { description: "Other payee" },
  ])("rejects ineligible evidence %j", (extra) => {
    expect(
      paymentEligible(
        payment(),
        posted(extra),
        schedule,
        TODAY,
        "2026-12-01",
        false,
      ) &&
        paymentEligible(
          payment(),
          posted(extra),
          schedule,
          TODAY,
          TODAY,
          false,
        ),
    ).toBe(false);
  });
  it("shows partial payment, full payment, overpayment and unknown invoices distinctly", () => {
    expect(state()).toMatchObject({ status: "unpaid", remaining: 18400 });
    expect(state(fact(), [evidence()], [posted()])).toMatchObject({
      status: "partial",
      paid: 10000,
      remaining: 8400,
    });
    const full = state(fact({ invoiceCents: 10000 }), [evidence()], [posted()]);
    expect(full).toMatchObject({ status: "paid", remaining: 0 });
    expect(isSettled(full)).toBe(true);
    expect(
      state(fact({ invoiceCents: 9000 }), [evidence()], [posted()]).overpaid,
    ).toBe(1000);
    expect(
      state(fact({ invoiceCents: null }), [evidence()], [posted()]),
    ).toMatchObject({ status: "review", remaining: 4500, needsReview: true });
    expect(state(fact({ invoiceCents: 0 }))).toMatchObject({
      status: "no_payment_due",
      remaining: 0,
    });
    expect(state(fact({ invoiceCents: null, markedPaid: true }))).toMatchObject(
      { status: "marked_paid", paid: 0, remaining: 0, needsReview: false },
    );
  });
  it.each([
    { accountId: "other" },
    { amountCents: -10001 },
    { amountCents: 10000 },
    { postedOn: "2026-10-10" },
    { postedOn: "2026-10-12" },
    { status: "pending" as const },
    { description: "Edited" },
    { isTransfer: true },
  ])("returns edited evidence to review: %j", (extra) => {
    expect(
      state(fact({ markedPaid: true }), [evidence()], [posted(extra)]),
    ).toMatchObject({
      status: "review",
      paid: 0,
      remaining: 18400,
      needsReview: true,
    });
  });
  it("does not trust removed evidence, and sums multiple valid payments in cents", () => {
    expect(state(fact(), [evidence({ transactionId: null })])).toMatchObject({
      status: "review",
      paid: 0,
    });
    expect(state(fact(), [evidence()], [])).toMatchObject({
      status: "review",
      paid: 0,
    });
    expect(
      state(
        fact(),
        [
          evidence(),
          evidence({
            id: "link2",
            transactionId: "tx2",
            originalTransactionId: "tx2",
          }),
        ],
        [posted(), posted({ id: "tx2" })],
      ),
    ).toMatchObject({
      status: "paid",
      paid: 20000,
      remaining: 0,
      overpaid: 1600,
    });
  });
});

describe("recorded cash versus bills", () => {
  it("separates known and estimated obligations and excludes non-cash, settled, distant and old predictions", () => {
    const accounts = [
      {
        id: "account",
        nickname: "Cash",
        type: "checking",
        currentBalanceCents: 50000,
        balanceAsOf: TODAY,
      },
      {
        id: "savings",
        nickname: "Savings",
        type: "savings",
        currentBalanceCents: 10000,
        balanceAsOf: null,
      },
      {
        id: "card",
        nickname: "Card",
        type: "credit_card",
        currentBalanceCents: -99999,
        balanceAsOf: TODAY,
      },
    ];
    const cycles = [
      { accountId: "account", cycle: state(fact(), [evidence()], [posted()]) },
      { accountId: "account", cycle: state(fact({ invoiceCents: null })) },
      {
        accountId: "savings",
        cycle: state(fact({ dueOn: "2026-09-01", invoiceCents: 500 })),
      },
      {
        accountId: "account",
        cycle: state(fact({ dueOn: "2026-09-01", dateSource: "predicted" })),
      },
      { accountId: "account", cycle: state(fact({ dueOn: "2026-12-01" })) },
      { accountId: "card", cycle: state() },
      { accountId: "account", cycle: state(fact({ markedPaid: true })) },
    ];
    expect(coverage(accounts, cycles, TODAY)).toMatchObject({
      recordedCash: 60000,
      known: 8900,
      estimated: 14500,
      afterKnown: 51100,
      afterEstimated: 36600,
      missingInvoices: 1,
      undatedBalances: 1,
    });
    expect(coverage([], cycles, TODAY)).toMatchObject({
      accounts: [],
      recordedCash: 0,
      known: 0,
    });
  });
});
