// Plausibility checks from docs/SYNTHETIC.md. These are warnings for the
// reviewer, not errors: a spec that fails them still loads.
import {
  type Cents,
  ZERO,
  add,
  absolute,
  cents,
  formatCents,
  fraction,
  ratio,
  sum,
  times,
} from "@/lib/money";
import {
  type IsoDate,
  type YearMonth,
  daysBetween,
  firstDay,
  lastDay,
  monthAt,
} from "./calendar";
import type { Expansion, GeneratedPerson } from "./expand";
import type { Persona, PersonSpec, Spec } from "./spec";

export type Warning = { person: string; message: string };

/** Take-home pay per year that fits each persona (docs/SYNTHETIC.md). */
export const TAKE_HOME_BANDS: Record<Persona, { min: Cents; max: Cents }> = {
  paycheck_to_paycheck: { min: cents(15_000_00), max: cents(34_000_00) },
  hourly_gig: { min: cents(16_000_00), max: cents(42_000_00) },
  student: { min: cents(3_000_00), max: cents(18_000_00) },
  salaried_middle: { min: cents(40_000_00), max: cents(78_000_00) },
  upper_middle_tech: { min: cents(75_000_00), max: cents(175_000_00) },
  retiree: { min: cents(22_000_00), max: cents(80_000_00) },
  single_parent: { min: cents(25_000_00), max: cents(58_000_00) },
};

const OVERDRAWN_LIMIT = cents(-100_00);

/** Average take-home per month, from the income schedules. */
export function monthlyIncome(person: PersonSpec): Cents {
  return sum(
    person.income.map(({ amountCents, schedule }) => {
      const amount = cents(amountCents);
      switch (schedule.every) {
        case "week":
          return fraction(amount, 52, 12);
        case "two_weeks":
          return fraction(amount, 26, 12);
        case "half_month":
          return times(amount, 2);
        case "month":
        case "month_weekday":
          return amount;
        case "irregular":
          return fraction(
            amount,
            schedule.perMonth.min + schedule.perMonth.max,
            2,
          );
      }
    }),
  );
}

/** Bills and subscriptions per month; a yearly charge counts as a twelfth. */
export function monthlyFixedCosts(person: PersonSpec): Cents {
  return sum(
    [...person.bills, ...person.subscriptions].map((item) =>
      item.cadence === "yearly"
        ? fraction(cents(item.amountCents), 1, 12)
        : cents(item.amountCents),
    ),
  );
}

function band(persona: Persona): string {
  const { min, max } = TAKE_HOME_BANDS[persona];
  return `${formatCents(min, { whole: true })}–${formatCents(max, { whole: true })}`;
}

/** Checks that need only the spec. */
export function checkSpec(spec: Spec): Warning[] {
  const warnings: Warning[] = [];
  const fingerprints = new Map<string, string>();
  for (const person of spec.people) {
    const warn = (message: string) =>
      warnings.push({ person: person.key, message });
    const income = monthlyIncome(person);
    const yearly = times(income, 12);
    const { min, max } = TAKE_HOME_BANDS[person.persona];
    if (yearly < min || yearly > max) {
      warn(
        `take-home ${formatCents(yearly, { whole: true })} a year is outside the ${person.persona} band (${band(person.persona)})`,
      );
    }
    const fixed = monthlyFixedCosts(person);
    if (income === ZERO || fixed >= income) {
      warn(
        `fixed costs ${formatCents(fixed)} a month are not less than take-home ${formatCents(income)}`,
      );
    }
    if (person.bills.length < 2) warn("has fewer than 2 recurring bills");

    const same = `${person.persona}|${income}|${fixed}`;
    const twin = fingerprints.get(same);
    if (twin) warn(`has the same income and fixed costs as ${twin}`);
    else fingerprints.set(same, person.key);
  }
  return warnings;
}

export type PersonStats = {
  key: string;
  persona: Persona;
  /** Pay per month (income rows), averaged over the days generated. */
  incomePerMonth: Cents;
  /** Other money in per month: refunds, aid, gifts (positive one-off events). */
  otherInPerMonth: Cents;
  spendingPerMonth: Cents;
  lowestChecking: Cents;
  closingChecking: Cents;
  transactions: number;
};

/**
 * The window that per-month figures are measured over: through the last
 * complete month, so a partial month (rent paid, payday not yet) does not
 * skew them. A span shorter than one month is measured as it is.
 */
export function statsWindow(expansion: Expansion): {
  startMonth: YearMonth;
  asOf: IsoDate;
} {
  const { startMonth, asOf } = expansion;
  const month = asOf.slice(0, 7);
  if (asOf === lastDay(month) || month === startMonth) {
    return { startMonth, asOf };
  }
  return { startMonth, asOf: lastDay(monthAt(month, -1)) };
}

/** The days a span covers: from its first day to `asOf`, both included. */
export function daysCovered(span: {
  startMonth: YearMonth;
  asOf: IsoDate;
}): number {
  return daysBetween(firstDay(span.startMonth), span.asOf) + 1;
}

/**
 * Averages per month over the days actually generated, so a span that ends
 * part-way through a month is not under-counted. Income and spending leave
 * out transfers (ADR-020) and investing (ADR-052).
 */
export function personStats(
  person: GeneratedPerson,
  span: { startMonth: YearMonth; asOf: IsoDate },
): PersonStats {
  let income = ZERO;
  let otherIn = ZERO;
  let spending = ZERO;
  for (const t of person.transactions) {
    // Transfers and money into retirement or investing are not spending
    // (ADR-020, ADR-052).
    if (t.kind === "transfer" || t.kind === "investment") continue;
    if (t.postedOn > span.asOf) continue;
    if (t.kind === "income") income = add(income, t.amount);
    else if (t.amount > 0) otherIn = add(otherIn, t.amount);
    else spending = add(spending, absolute(t.amount));
  }
  // An average month is 30.4375 days (365.25 / 12).
  const days = daysCovered(span);
  const perMonth = (total: Cents) => fraction(total, 304_375, days * 10_000);
  const checking = person.accounts.find((a) => a.key === "checking")!;
  return {
    key: person.key,
    persona: person.persona,
    incomePerMonth: perMonth(income),
    otherInPerMonth: perMonth(otherIn),
    spendingPerMonth: perMonth(spending),
    lowestChecking: checking.lowestBalance,
    closingChecking: checking.closingBalance,
    transactions: person.transactions.length,
  };
}

/** Checks that need the generated rows. */
export function checkExpansion(expansion: Expansion): Warning[] {
  const warnings: Warning[] = [];
  for (const person of expansion.people) {
    const stats = personStats(person, statsWindow(expansion));
    if (stats.lowestChecking < OVERDRAWN_LIMIT) {
      warnings.push({
        person: person.key,
        message: `checking goes as low as ${formatCents(stats.lowestChecking)}`,
      });
    }
    const moneyIn = add(stats.incomePerMonth, stats.otherInPerMonth);
    if (moneyIn > 0 && ratio(stats.spendingPerMonth, moneyIn) > 1.1) {
      warnings.push({
        person: person.key,
        message: `spends ${formatCents(stats.spendingPerMonth)} a month against ${formatCents(moneyIn)} coming in`,
      });
    }
  }
  return warnings;
}
