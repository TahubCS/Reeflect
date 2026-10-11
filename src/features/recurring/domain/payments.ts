import {
  type Cents,
  ZERO,
  absolute,
  add,
  cents,
  fraction,
  negate,
  sum,
} from "@/lib/money";
import { normalizeMerchant } from "@/features/categorization/client";
import {
  cadenceLabel,
  daysBetween,
  nextAfter,
  shiftDays,
  shiftMonths,
} from "./dates";
import {
  type AmountMode,
  type Charge,
  type Kind,
  type Pattern,
  type ScheduleUnit,
  findPatterns,
  groupAll,
  paymentKey,
  typicalAmounts,
} from "./patterns";

export type SavedPayment = {
  id: string;
  accountId: string;
  merchant: string;
  name: string;
  decision: "candidate" | "confirmed" | "dismissed";
  kind: Kind;
  amountMode: AmountMode;
  unit: ScheduleUnit;
  every: number;
  amountCents: number | null;
  baselineAmountCents: number;
  nextOn: string | null;
  manual: boolean;
  userIntent: "none" | "keep" | "cancel";
};
export type Payment = {
  key: string;
  accountId: string;
  merchant: string;
  name: string;
  decision: SavedPayment["decision"];
  kind: Kind;
  amountMode: AmountMode;
  unit: ScheduleUnit;
  every: number;
  cadence: string;
  useHistory: boolean;
  amount: Cents;
  low: Cents;
  high: Cents;
  monthly: Cents;
  yearly: Cents;
  actual: Cents;
  nextOn: string | null;
  dateSource: "user" | "predicted";
  lastOn: string | null;
  active: boolean;
  manual: boolean;
  userIntent: SavedPayment["userIntent"];
  priceChanged: boolean;
  previousAmount: Cents;
  sampleCount: number;
  timingScore: number | null;
  charges: Charge[];
};

export function annualCost(
  amount: Cents,
  unit: ScheduleUnit,
  every: number,
): Cents {
  // Monthly/quarterly/yearly schedules use calendar months; intervals use a
  // 365-day annual estimate. Round once, through the money library.
  return fraction(amount, unit === "months" ? 12 : 365, every);
}

export function buildPayments(
  charges: readonly Charge[],
  saved: readonly SavedPayment[],
  today: string,
): Payment[] {
  const { groups } = groupAll(charges, today);
  const actualByPayee = new Map<string, Cents>();
  for (const charge of charges) {
    if (
      charge.status !== "posted" ||
      charge.isTransfer ||
      charge.postedOn > today ||
      !charge.postedOn.startsWith(today.slice(0, 7)) ||
      charge.descriptionRaw.length > 2000
    )
      continue;
    const key = paymentKey(
      charge.accountId,
      normalizeMerchant(charge.descriptionRaw),
    );
    actualByPayee.set(
      key,
      add(actualByPayee.get(key) ?? ZERO, negate(cents(charge.amountCents))),
    );
  }
  const patterns = new Map(
    findPatterns(charges, today).map((pattern) => [pattern.key, pattern]),
  );
  const rows = new Map(
    saved.map((row) => [paymentKey(row.accountId, row.merchant), row]),
  );
  const keys = new Set([...patterns.keys(), ...rows.keys()]);
  const payments: Payment[] = [];
  for (const key of keys) {
    const pattern: Pattern | undefined = patterns.get(key);
    const stored = rows.get(key);
    if (!pattern && stored?.decision === "candidate") continue;
    // A saved suggestion is not a user override. Its inferred fields stay fresh.
    const row = stored?.decision === "candidate" ? undefined : stored;
    const history = groups.get(key) ?? [];
    const recent = history.at(-1);
    const amounts = history.length ? typicalAmounts(history) : null;
    const kind = row?.kind ?? pattern!.kind;
    const amountMode = row?.amountMode ?? pattern!.amountMode;
    const unit = row?.unit ?? pattern!.unit;
    const every = row?.every ?? pattern!.every;
    const latest = recent ? absolute(cents(recent.amountCents)) : null;
    const amount =
      row?.amountCents !== null && row?.amountCents !== undefined
        ? cents(row.amountCents)
        : ((amountMode === "fixed" ? latest : amounts?.typical) ??
          cents(row?.baselineAmountCents ?? pattern!.typical));
    const lastOn = recent?.postedOn ?? null;
    const period = unit === "months" ? every * 30.4375 : every;
    const active = Boolean(
      row?.manual ||
      (pattern && lastOn && daysBetween(lastOn, today) <= period * 2),
    );
    const decision = stored?.decision ?? "candidate";
    let nextOn = row?.nextOn ?? pattern?.nextOn ?? null;
    if (row?.nextOn && lastOn && lastOn >= row.nextOn)
      nextOn = nextAfter(row.nextOn, unit, every, lastOn);
    else if (!row?.nextOn && lastOn)
      nextOn =
        unit === "months"
          ? shiftMonths(lastOn, every, pattern?.anchorDay)
          : shiftDays(lastOn, every);
    const yearly = annualCost(amount, unit, every);
    payments.push({
      key,
      accountId: row?.accountId ?? pattern!.accountId,
      merchant: row?.merchant ?? pattern!.merchant,
      name: row?.name ?? pattern!.merchant,
      decision,
      kind,
      amountMode,
      unit,
      every,
      cadence: cadenceLabel(unit, every),
      useHistory: row?.amountCents === null || row?.amountCents === undefined,
      amount,
      low: amounts?.low ?? amount,
      high: amounts?.high ?? amount,
      monthly: fraction(yearly, 1, 12),
      yearly,
      // Charges net of credits; for pay, deposits net of anything sent back.
      actual:
        kind === "income"
          ? negate(actualByPayee.get(key) ?? ZERO)
          : (actualByPayee.get(key) ?? ZERO),
      nextOn,
      dateSource: row?.nextOn ? "user" : "predicted",
      lastOn,
      active,
      manual: row?.manual ?? false,
      userIntent:
        kind === "subscription" ? (row?.userIntent ?? "none") : "none",
      priceChanged: Boolean(
        row?.decision === "confirmed" &&
        amountMode === "fixed" &&
        latest !== null &&
        latest !== row.baselineAmountCents,
      ),
      previousAmount: cents(row?.baselineAmountCents ?? amount),
      sampleCount: amounts?.sampleCount ?? 0,
      timingScore: pattern?.timingScore ?? null,
      charges: history.slice(-12),
    });
  }
  return payments.sort(
    (a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key),
  );
}

export function summarizePayments(payments: readonly Payment[]) {
  const confirmedAll = payments.filter(
    (payment) => payment.decision === "confirmed",
  );
  // Pay is money in: it never counts toward recurring costs (ADR-061).
  const confirmed = confirmedAll.filter((payment) => payment.kind !== "income");
  const active = confirmed.filter((payment) => payment.active);
  const pay = sum(
    confirmedAll
      .filter((payment) => payment.kind === "income" && payment.active)
      .map((payment) => payment.yearly),
  );
  const yearly = sum(active.map((payment) => payment.yearly));
  const bills = sum(
    active
      .filter((payment) => payment.kind === "bill")
      .map((payment) => payment.yearly),
  );
  const subscriptions = sum(
    active
      .filter((payment) => payment.kind === "subscription")
      .map((payment) => payment.yearly),
  );
  return {
    yearly,
    monthly: fraction(yearly, 1, 12),
    bills: fraction(bills, 1, 12),
    subscriptions: fraction(subscriptions, 1, 12),
    actual: sum(confirmed.map((payment) => payment.actual)),
    saving: sum(
      active
        .filter(
          (payment) =>
            payment.kind === "subscription" && payment.userIntent === "cancel",
        )
        .map((payment) => payment.yearly),
    ),
    /** Expected pay a month, from confirmed active paydays. */
    income: fraction(pay, 1, 12),
    candidates: payments.filter((payment) => payment.decision === "candidate")
      .length,
    count: active.length,
    variable: active.some((payment) => payment.amountMode === "variable"),
  };
}
