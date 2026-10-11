import { normalizeMerchant } from "@/features/categorization/client";
import {
  dayOf,
  shiftDays,
  shiftMonths,
  type Payment,
} from "@/features/recurring/client";
import {
  ZERO,
  absolute,
  cents,
  positivePart,
  subtract,
  sum,
  type Cents,
} from "@/lib/money";

export type Schedule = {
  anchorOn: string;
  unit: "days" | "months";
  every: number;
};
export type CycleFact = {
  id: string | null;
  scheduledOn: string;
  dueOn: string;
  dateSource: "user" | "predicted";
  invoiceCents: number | null;
  estimateCents: number;
  markedPaid: boolean;
  revision: number;
};
export type EvidenceFact = {
  id: string;
  transactionId: string | null;
  originalTransactionId: string;
  accountId: string;
  amountCents: number;
  postedOn: string;
  description: string;
  isTransfer: boolean;
};
export type PostedFact = {
  id: string;
  accountId: string;
  amountCents: number;
  postedOn: string;
  description: string;
  status: "pending" | "posted";
  isTransfer: boolean;
};
export type CycleStatus =
  "unpaid" | "partial" | "paid" | "marked_paid" | "no_payment_due" | "review";
export type CycleView = CycleFact & {
  paid: Cents;
  remaining: Cents;
  overpaid: Cents;
  status: CycleStatus;
  needsReview: boolean;
  evidence: (EvidenceFact & { valid: boolean })[];
};

export function scheduledDate(schedule: Schedule, offset: number): string {
  return schedule.unit === "months"
    ? shiftMonths(
        schedule.anchorOn,
        offset * schedule.every,
        dayOf(schedule.anchorOn),
      )
    : shiftDays(schedule.anchorOn, offset * schedule.every);
}
export function cycleOffset(schedule: Schedule, on: string): number {
  const distance =
    schedule.unit === "months"
      ? (Number(on.slice(0, 4)) - Number(schedule.anchorOn.slice(0, 4))) * 12 +
        Number(on.slice(5, 7)) -
        Number(schedule.anchorOn.slice(5, 7))
      : (Date.parse(on) - Date.parse(schedule.anchorOn)) / 86400000;
  return Math.floor(distance / schedule.every);
}
export function isScheduledDate(schedule: Schedule, on: string): boolean {
  return scheduledDate(schedule, cycleOffset(schedule, on)) === on;
}
export function projectedCycles(
  payment: Payment,
  anchor: { anchorOn: string; dateSource: "user" | "predicted" } | null,
  saved: readonly CycleFact[],
  today: string,
): CycleFact[] {
  const result = new Map(
    saved.map((cycle) => [cycle.scheduledOn, { ...cycle }]),
  );
  const start = anchor?.anchorOn ?? payment.nextOn;
  if (
    !start ||
    payment.decision !== "confirmed" ||
    payment.kind !== "bill" ||
    (!payment.active && !anchor)
  )
    return [...result.values()];
  const schedule: Schedule = {
    anchorOn: start,
    unit: payment.unit,
    every: payment.every,
  };
  let offset = Math.max(0, cycleOffset(schedule, today));
  if (scheduledDate(schedule, offset) < today) offset++;
  const end = shiftDays(today, 90);
  for (let n = 0; n <= 90; n++) {
    const on = scheduledDate(schedule, offset + n);
    if (on > end || on > "2199-12-31") break;
    if (!result.has(on))
      result.set(on, {
        id: null,
        scheduledOn: on,
        dueOn: on,
        dateSource: anchor?.dateSource ?? "predicted",
        invoiceCents: null,
        estimateCents: payment.amount,
        markedPaid: false,
        revision: 0,
      });
  }
  return [...result.values()].sort(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) ||
      a.scheduledOn.localeCompare(b.scheduledOn),
  );
}

export function paymentEligible(
  payment: Pick<Payment, "accountId" | "merchant">,
  row: PostedFact,
  schedule: Schedule,
  on: string,
  today: string,
  debt: boolean,
): boolean {
  const offset = cycleOffset(schedule, on);
  return (
    row.accountId === payment.accountId &&
    row.status === "posted" &&
    row.amountCents < 0 &&
    row.amountCents >= -10000000000 &&
    row.postedOn <= today &&
    row.postedOn > scheduledDate(schedule, offset - 1) &&
    row.postedOn < scheduledDate(schedule, offset + 1) &&
    (!row.isTransfer || debt) &&
    normalizeMerchant(row.description) === payment.merchant
  );
}
export function cycleState(
  cycle: CycleFact,
  evidence: readonly EvidenceFact[],
  posted: ReadonlyMap<string, PostedFact>,
  today: string,
): CycleView {
  const links = evidence.map((link) => {
    const row = link.transactionId ? posted.get(link.transactionId) : undefined;
    return {
      ...link,
      valid: Boolean(
        row &&
        row.status === "posted" &&
        row.postedOn <= today &&
        row.accountId === link.accountId &&
        row.amountCents < 0 &&
        absolute(cents(row.amountCents)) === link.amountCents &&
        row.postedOn === link.postedOn &&
        row.description === link.description &&
        row.isTransfer === link.isTransfer,
      ),
    };
  });
  const paid = sum(
    links.filter((link) => link.valid).map((link) => cents(link.amountCents)),
  );
  const amount = cents(cycle.invoiceCents ?? cycle.estimateCents);
  const invalidEvidence = links.some((link) => !link.valid);
  const needsReview =
    invalidEvidence || (cycle.invoiceCents === null && !cycle.markedPaid);
  const status: CycleStatus = invalidEvidence
    ? "review"
    : cycle.markedPaid
      ? "marked_paid"
      : cycle.invoiceCents === 0
        ? "no_payment_due"
        : cycle.invoiceCents === null
          ? "review"
          : paid >= amount
            ? "paid"
            : paid > ZERO
              ? "partial"
              : "unpaid";
  return {
    ...cycle,
    paid,
    status,
    needsReview,
    remaining:
      status === "marked_paid" || status === "no_payment_due"
        ? ZERO
        : positivePart(subtract(amount, paid)),
    overpaid: positivePart(subtract(paid, amount)),
    evidence: links,
  };
}
export const isSettled = (cycle: CycleView) =>
  ["paid", "marked_paid", "no_payment_due"].includes(cycle.status);
export function coverage(
  accounts: readonly {
    id: string;
    nickname: string;
    type: string;
    currentBalanceCents: number;
    balanceAsOf: string | null;
  }[],
  cycles: readonly { accountId: string; cycle: CycleView }[],
  today: string,
) {
  const liquid = accounts.filter(
    (a) => a.type === "checking" || a.type === "savings",
  );
  const ids = new Set(liquid.map((a) => a.id));
  const commitments = cycles.filter(
    ({ accountId, cycle }) =>
      ids.has(accountId) &&
      !isSettled(cycle) &&
      cycle.dueOn <= shiftDays(today, 30) &&
      (cycle.dueOn >= today || cycle.dateSource === "user"),
  );
  const known = sum(
    commitments
      .filter(({ cycle }) => cycle.invoiceCents !== null)
      .map(({ cycle }) => cycle.remaining),
  );
  const estimated = sum(
    commitments
      .filter(({ cycle }) => cycle.invoiceCents === null)
      .map(({ cycle }) => cycle.remaining),
  );
  const recordedCash = sum(liquid.map((a) => cents(a.currentBalanceCents)));
  return {
    recordedCash,
    known,
    estimated,
    afterKnown: subtract(recordedCash, known),
    afterEstimated: subtract(subtract(recordedCash, known), estimated),
    missingInvoices: commitments.filter(
      ({ cycle }) => cycle.invoiceCents === null,
    ).length,
    undatedBalances: liquid.filter((a) => !a.balanceAsOf).length,
    accounts: liquid,
  };
}
