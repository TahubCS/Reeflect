import { z } from "zod";
import { normalizeMerchant } from "@/features/categorization/client";
import {
  type Cents,
  absolute,
  add,
  cents,
  fraction,
  subtract,
} from "@/lib/money";
import {
  dateSchema,
  dayOf,
  daysBetween,
  median,
  monthNumber,
  shiftDays,
  shiftMonths,
} from "./dates";

export const HISTORY_DAYS = 1096;
export const MAX_CHARGES = 20_000;
// With 1,000 saved payments, even daily annual estimates remain safe integers.
export const MAX_AMOUNT = 10_000_000_000;
export const merchantSchema = z.string().trim().min(1).max(500);
export const chargeSchema = z.object({
  id: z.string().min(1).max(128),
  accountId: z.uuid(),
  postedOn: dateSchema,
  descriptionRaw: z.string().max(10_000),
  amountCents: z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT),
  status: z.enum(["posted", "pending"]),
  isTransfer: z.boolean(),
  categoryKey: z.string().nullable(),
  source: z.string().max(32),
});
export type Charge = z.infer<typeof chargeSchema>;
export type Kind = "bill" | "subscription";
export type AmountMode = "fixed" | "variable";
export type ScheduleUnit = "days" | "months";
export type Pattern = {
  key: string;
  accountId: string;
  merchant: string;
  kind: Kind;
  amountMode: AmountMode;
  unit: ScheduleUnit;
  every: number;
  intervalDays: number;
  anchorDay: number;
  typical: Cents;
  low: Cents;
  high: Cents;
  lastAmount: Cents;
  lastOn: string;
  nextOn: string;
  sampleCount: number;
  timingScore: number;
  charges: Charge[];
};
export const paymentKey = (accountId: string, merchant: string) =>
  JSON.stringify([accountId, merchant]);

export function typicalAmounts(charges: readonly Charge[]) {
  const amounts = charges
    .slice(-3)
    .map((charge) => absolute(cents(charge.amountCents)))
    .sort((a, b) => a - b);
  const middle = Math.floor(amounts.length / 2);
  const typical =
    amounts.length % 2
      ? amounts[middle]!
      : add(
          amounts[middle - 1]!,
          fraction(subtract(amounts[middle]!, amounts[middle - 1]!), 1, 2),
        );
  return {
    typical,
    low: amounts[0]!,
    high: amounts.at(-1)!,
    sampleCount: amounts.length,
  };
}

/** Eligible evidence only. No description truncation or prefix matching. */
export function groupCharges(
  input: readonly Charge[],
  today: string,
): Map<string, Charge[]> {
  dateSchema.parse(today);
  const charges = z.array(chargeSchema).max(MAX_CHARGES).parse(input);
  const first = shiftDays(today, -HISTORY_DAYS);
  const groups = new Map<string, Charge[]>();
  for (const charge of charges) {
    if (
      charge.status !== "posted" ||
      charge.isTransfer ||
      charge.amountCents >= 0 ||
      charge.postedOn > today ||
      charge.postedOn < first ||
      charge.descriptionRaw.length > 2000
    )
      continue;
    const merchant = normalizeMerchant(charge.descriptionRaw);
    if (!merchantSchema.safeParse(merchant).success) continue;
    const key = paymentKey(charge.accountId, merchant);
    const group = groups.get(key) ?? [];
    group.push(charge);
    groups.set(key, group);
  }
  for (const group of groups.values())
    group.sort(
      (a, b) =>
        a.postedOn.localeCompare(b.postedOn) || a.id.localeCompare(b.id),
    );
  return groups;
}

/** ADR-058: learn timing; amount stability never gates a suggestion. */
export function findPatterns(
  input: readonly Charge[],
  today: string,
): Pattern[] {
  const patterns: Pattern[] = [];
  for (const [key, group] of groupCharges(input, today)) {
    if (group.length < 3) continue;
    const recent = group.slice(-6);
    const gaps = recent
      .slice(1)
      .map((charge, i) => daysBetween(recent[i]!.postedOn, charge.postedOn));
    // Multiple same-day payments make a single-payee series ambiguous.
    if (gaps.some((gap) => gap === 0)) continue;
    const intervalDays = median(gaps);
    // Excludes daily shopping; dispersion is relative to the observed period.
    if (intervalDays < 4) continue;
    const deviations = gaps.map((gap) => Math.abs(gap - intervalDays));
    if (
      median(deviations) / intervalDays > 0.2 ||
      Math.max(...deviations) / intervalDays > 0.35
    )
      continue;
    const last = recent.at(-1)!;
    if (daysBetween(last.postedOn, today) > intervalDays * 2) continue;
    const monthGaps = recent
      .slice(1)
      .map(
        (charge, i) =>
          monthNumber(charge.postedOn) - monthNumber(recent[i]!.postedOn),
      );
    const anchorDay = Math.round(
      median(recent.map((charge) => dayOf(charge.postedOn))),
    );
    const calendar =
      monthGaps[0]! > 0 &&
      monthGaps.every((gap) => gap === monthGaps[0]) &&
      recent.every(
        (charge) =>
          Math.abs(
            daysBetween(
              shiftMonths(charge.postedOn, 0, anchorDay),
              charge.postedOn,
            ),
          ) <= Math.max(2, intervalDays * 0.1),
      );
    const unit: ScheduleUnit = calendar ? "months" : "days";
    const every = calendar ? monthGaps[0]! : Math.round(intervalDays);
    const amounts = typicalAmounts(group);
    const merchant = normalizeMerchant(last.descriptionRaw);
    const kind: Kind = recent.some((charge) =>
      ["housing", "utilities", "transport"].includes(charge.categoryKey ?? ""),
    )
      ? "bill"
      : "subscription";
    patterns.push({
      key,
      accountId: last.accountId,
      merchant,
      kind,
      amountMode: amounts.low === amounts.high ? "fixed" : "variable",
      unit,
      every,
      intervalDays,
      anchorDay,
      ...amounts,
      lastAmount: absolute(cents(last.amountCents)),
      lastOn: last.postedOn,
      nextOn: calendar
        ? shiftMonths(last.postedOn, every, anchorDay)
        : shiftDays(last.postedOn, every),
      timingScore: Math.round((1 - median(deviations) / intervalDays) * 100),
      charges: group.slice(-12),
    });
  }
  return patterns.sort((a, b) => a.key.localeCompare(b.key));
}
