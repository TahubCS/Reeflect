import { type Cents, formatCents } from "@/lib/money";

// What DETAILS answers (ADR-038, ADR-105): the amounts behind the last
// proactive text. The user asked, so amounts are allowed here. Every number
// comes from code and is formatted by src/lib/money (ADR-019).

export type SubscriptionFacts = {
  name: string;
  amount: Cents;
  fixed: boolean;
  /** "Monthly", "Every two weeks", ... from recurring's cadence label. */
  cadence: string;
  monthly: Cents;
  yearly: Cents;
};

export function subscriptionDetails(facts: SubscriptionFacts): string {
  const each = `${facts.fixed ? "" : "about "}${formatCents(facts.amount)}`;
  return `${facts.name}: ${each} a charge (${facts.cadence.toLowerCase()}), about ${formatCents(facts.monthly)} a month and ${formatCents(facts.yearly)} a year. Reply KEEP, CANCEL or IGNORE.`;
}

export type BillFacts = {
  name: string;
  /** What is left to pay this cycle. */
  remaining: Cents;
  /** True when no invoice amount was entered, so `remaining` is an estimate. */
  estimated: boolean;
  /** "today", "tomorrow" or "on Monday, October 15". */
  when: string;
  autopay: boolean;
  /** Checking plus savings, or null when there is none to compare. */
  liquid: Cents | null;
};

export function billDetails(facts: BillFacts): string {
  const amount = `${facts.estimated ? "about " : ""}${formatCents(facts.remaining)}`;
  const parts = [`${facts.name}: ${amount} due ${facts.when}.`];
  if (facts.estimated) parts.push("That's an estimate from past payments.");
  if (facts.autopay) parts.push("It's set to be paid automatically.");
  // ADR-030's low-balance line: calm and factual, no alarm.
  if (facts.liquid !== null && facts.liquid < facts.remaining) {
    parts.push(
      `Your balance is ${formatCents(facts.liquid)}, which is less than this payment.`,
    );
  }
  return parts.join(" ");
}
