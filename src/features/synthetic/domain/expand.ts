// The expander (ADR-049): spec + seed → accounts and transactions. Pure and
// deterministic: the same spec, seed and GENERATOR_VERSION give the same
// output on any machine, so a batch tried on the batch-testing branch can be
// replayed into production. Each month draws from its own random streams, so
// extending the span never changes the months already generated.
import {
  type Cents,
  ZERO,
  add,
  cents,
  fraction,
  negate,
  subtract,
  truncateToDollars,
} from "@/lib/money";
import {
  type IsoDate,
  type YearMonth,
  dateIn,
  daysInMonth,
  everyNDaysIn,
  firstDay,
  lastDay,
  monthAt,
  previousBusinessDay,
  weekdaysIn,
} from "./calendar";
import { type Random, randomFor } from "./random";
import type { Category, PersonSpec, Persona, Schedule, Spec } from "./spec";

/**
 * Bump when a change would make the same spec and seed give different rows.
 * v2: retirement and investing (ADR-052). A v1 checkout would read a spec
 * that uses them and silently leave those rows out, so replay needs v2.
 */
export const GENERATOR_VERSION = 2;

export type AccountKey = "checking" | "savings" | "card";
export type AccountType = "checking" | "savings" | "credit_card";

export type TransactionKind =
  | "income"
  | "bill"
  | "subscription"
  | "everyday"
  | "transfer"
  | "interest"
  | "event"
  /** Money into retirement or a brokerage: saving, not spending (ADR-052). */
  | "investment";

export type GeneratedTransaction = {
  /** Stable for the same spec and seed: `<person>:<YYYY-MM>:<n>`. */
  id: string;
  account: AccountKey;
  postedOn: IsoDate;
  /** Signed from the account holder's view (ADR-008). */
  amount: Cents;
  description: string;
  kind: TransactionKind;
  /** What the generator meant it as; categorization assigns the real one. */
  category: Category;
  /** Both sides of a transfer or card payment share this (ADR-020). */
  transferPair: string | null;
};

export type GeneratedAccount = {
  key: AccountKey;
  type: AccountType;
  nickname: string;
  mask: string;
  openingBalance: Cents;
  closingBalance: Cents;
  /** Lowest end-of-day balance in the span. */
  lowestBalance: Cents;
};

export type GeneratedPerson = {
  key: string;
  name: string;
  persona: Persona;
  summary: string;
  /** Their retirement answer; null when not answered (ADR-052). */
  retirement: PersonSpec["retirement"] | null;
  accounts: GeneratedAccount[];
  transactions: GeneratedTransaction[];
};

export type Expansion = {
  generatorVersion: number;
  seed: string;
  startMonth: YearMonth;
  months: number;
  asOf: IsoDate;
  people: GeneratedPerson[];
};

export type ExpandOptions = {
  seed: string;
  /** Cut every amount to whole dollars, as Nessie stores them (ADR-048). */
  wholeDollars?: boolean;
};

const ACCOUNT_INFO: Record<
  AccountKey,
  { type: AccountType; nickname: string }
> = {
  checking: { type: "checking", nickname: "360 Checking" },
  savings: { type: "savings", nickname: "360 Performance Savings" },
  card: { type: "credit_card", nickname: "Credit Card" },
};

const ONE_DOLLAR = cents(100);
const MINIMUM_PAYMENT_FLOOR = cents(25_00);

/** The last day of the span. */
export function spanEnd(spec: Pick<Spec, "startMonth" | "months">): IsoDate {
  return lastDay(monthAt(spec.startMonth, spec.months - 1));
}

export function expandSpec(spec: Spec, options: ExpandOptions): Expansion {
  // The last day generated: asOf, but never past the span's end.
  const end = spanEnd(spec);
  const asOf = spec.asOf !== undefined && spec.asOf < end ? spec.asOf : end;
  return {
    generatorVersion: GENERATOR_VERSION,
    seed: options.seed,
    startMonth: spec.startMonth,
    months: spec.months,
    asOf,
    people: spec.people.map((person) =>
      expandPerson(person, {
        ...options,
        startMonth: spec.startMonth,
        months: spec.months,
        asOf,
      }),
    ),
  };
}

type PersonContext = ExpandOptions & {
  startMonth: YearMonth;
  months: number;
  asOf: IsoDate;
};

type Row = Omit<GeneratedTransaction, "id">;

/** ± up to `pct` percent, in basis points, rounded to the cent. */
function vary(amount: Cents, pct: number, random: Random): Cents {
  if (pct === 0) return amount;
  const basisPoints = random.int(-pct * 100, pct * 100);
  return fraction(amount, 10_000 + basisPoints, 10_000);
}

function scheduleDates(
  schedule: Schedule,
  month: YearMonth,
  random: Random,
): IsoDate[] {
  switch (schedule.every) {
    case "week":
      return weekdaysIn(month, schedule.weekday);
    case "two_weeks":
      return everyNDaysIn(month, schedule.anchor, 14);
    case "half_month":
      return schedule.days.map((day) =>
        previousBusinessDay(dateIn(month, day)),
      );
    case "month":
      return [previousBusinessDay(dateIn(month, schedule.day))];
    case "month_weekday":
      return [weekdaysIn(month, schedule.weekday)[schedule.nth - 1]!];
    case "irregular": {
      const count = random.int(schedule.perMonth.min, schedule.perMonth.max);
      return Array.from({ length: count }, () =>
        dateIn(month, random.int(1, daysInMonth(month))),
      );
    }
  }
}

function isDue(
  item: { cadence: "monthly" | "yearly"; month?: number },
  month: YearMonth,
): boolean {
  return item.cadence === "monthly" || Number(month.slice(5, 7)) === item.month;
}

export function expandPerson(
  person: PersonSpec,
  context: PersonContext,
): GeneratedPerson {
  const { seed, wholeDollars = false } = context;
  const { card, savings } = person.accounts;
  const stream = (month: YearMonth, name: string) =>
    randomFor(seed, person.key, month, name);

  /** In whole-dollar mode, cut to dollars but never to zero. */
  const settle = (amount: Cents): Cents => {
    if (!wholeDollars) return amount;
    const whole = truncateToDollars(amount);
    if (whole !== 0) return whole;
    return amount > 0 ? ONE_DOLLAR : negate(ONE_DOLLAR);
  };

  const transactions: GeneratedTransaction[] = [];
  // Card statements close on the last day of each month. Positive = owed.
  let owedAtLastClose = card ? negate(cents(card.openingBalanceCents)) : ZERO;
  let cardBalance = card ? cents(card.openingBalanceCents) : ZERO;

  for (let i = 0; i < context.months; i += 1) {
    const month = monthAt(context.startMonth, i);
    const rows: Row[] = [];
    let pairs = 0;
    const pair = (
      date: IsoDate,
      amount: Cents,
      from: AccountKey,
      to: AccountKey,
      fromText: string,
      toText: string,
    ) => {
      const transferPair = `${person.key}:${month}:pair${(pairs += 1)}`;
      const shared = { postedOn: date, kind: "transfer" as const };
      rows.push(
        {
          ...shared,
          account: from,
          amount: negate(amount),
          description: fromText,
          category: "Transfers",
          transferPair,
        },
        {
          ...shared,
          account: to,
          amount,
          description: toText,
          category: "Transfers",
          transferPair,
        },
      );
    };

    person.income.forEach((income, j) => {
      const random = stream(month, `income:${j}`);
      for (const postedOn of scheduleDates(income.schedule, month, random)) {
        rows.push({
          account: "checking",
          postedOn,
          amount: settle(
            vary(cents(income.amountCents), income.variationPct, random),
          ),
          description: income.payer,
          kind: "income",
          category: "Pay",
          transferPair: null,
        });
      }
    });

    const recurring: [
      "bill" | "subscription",
      (PersonSpec["bills"][number] | PersonSpec["subscriptions"][number])[],
      (index: number) => Category,
    ][] = [
      ["bill", person.bills, (j) => person.bills[j]!.category],
      ["subscription", person.subscriptions, () => "Subscriptions"],
    ];
    for (const [kind, items, categoryOf] of recurring) {
      items.forEach((item, j) => {
        if (!isDue(item, month)) return;
        const random = stream(month, `${kind}:${j}`);
        rows.push({
          account: item.account,
          postedOn: dateIn(month, item.day),
          amount: negate(
            settle(vary(cents(item.amountCents), item.variationPct, random)),
          ),
          description: item.name,
          kind,
          category: categoryOf(j),
          transferPair: null,
        });
      });
    }

    if (savings && savings.monthlyTransferCents > 0) {
      pair(
        dateIn(month, savings.transferDay),
        settle(cents(savings.monthlyTransferCents)),
        "checking",
        "savings",
        "TRANSFER TO 360 PERFORMANCE SAVINGS",
        "TRANSFER FROM 360 CHECKING",
      );
    }

    // Into an IRA or a brokerage: out of checking, to an account outside the
    // workspace, counted as saving rather than spending (ADR-052).
    const investments = person.investing.map((item) => ({
      ...item,
      category: "Investing" as Category,
    }));
    if (person.retirement?.plan === "own") {
      investments.unshift({ ...person.retirement, category: "Retirement" });
    }
    for (const item of investments) {
      rows.push({
        account: "checking",
        postedOn: dateIn(month, item.day),
        amount: negate(settle(cents(item.amountCents))),
        description: item.name,
        kind: "investment",
        category: item.category,
        transferPair: null,
      });
    }

    person.spending.forEach((spending, j) => {
      const random = stream(month, `spending:${j}`);
      const count = random.int(spending.perMonth.min, spending.perMonth.max);
      for (let k = 0; k < count; k += 1) {
        const postedOn = dateIn(month, random.int(1, daysInMonth(month)));
        const merchant = random.pick(spending.merchants);
        const amount = cents(
          random.int(spending.amountCents.min, spending.amountCents.max),
        );
        const onCard =
          card !== undefined && random.int(1, 100) <= spending.cardShare;
        rows.push({
          account: onCard ? "card" : "checking",
          postedOn,
          amount: negate(settle(amount)),
          description: merchant,
          kind: "everyday",
          category: spending.category,
          transferPair: null,
        });
      }
    });

    for (const event of person.events) {
      if (!event.date.startsWith(month)) continue;
      rows.push({
        account: event.account,
        postedOn: event.date,
        amount: settle(cents(event.amountCents)),
        description: event.description,
        kind: "event",
        category: event.category,
        transferPair: null,
      });
    }

    if (card) {
      let payment = ZERO;
      if (owedAtLastClose > 0) {
        const plan = card.payment;
        payment =
          plan.kind === "full"
            ? owedAtLastClose
            : plan.kind === "minimum"
              ? maxOf(MINIMUM_PAYMENT_FLOOR, fraction(owedAtLastClose, 2, 100))
              : cents(plan.amountCents);
        payment = settle(minOf(payment, owedAtLastClose));
        pair(
          dateIn(month, card.paymentDay),
          payment,
          "checking",
          "card",
          "CAPITAL ONE CARD PMT",
          "PAYMENT - THANK YOU",
        );
      }
      const carried = subtract(owedAtLastClose, payment);
      if (carried > 0 && card.aprBps > 0) {
        // A month's interest on what was carried over: APR / 12.
        const raw = fraction(carried, card.aprBps, 120_000);
        const interest = wholeDollars ? truncateToDollars(raw) : raw;
        if (interest > 0) {
          rows.push({
            account: "card",
            postedOn: lastDay(month),
            amount: negate(interest),
            description: "INTEREST CHARGE:PURCHASES",
            kind: "interest",
            category: "Interest",
            transferPair: null,
          });
        }
      }
      for (const row of rows) {
        if (row.account === "card") cardBalance = add(cardBalance, row.amount);
      }
      owedAtLastClose = cardBalance < 0 ? negate(cardBalance) : ZERO;
    }

    // Numbered in the order generated, so ids stay put when the span grows.
    rows.forEach((row, n) =>
      transactions.push({ id: `${person.key}:${month}:${n + 1}`, ...row }),
    );
  }

  // A payday moved back to Friday can land before the span starts.
  const from = firstDay(context.startMonth);
  const kept = transactions
    .filter((t) => t.postedOn >= from && t.postedOn <= context.asOf)
    .sort(byDate); // stable: same-day rows keep their generated order

  const openings: [AccountKey, Cents][] = [
    ["checking", cents(person.accounts.checking.openingBalanceCents)],
  ];
  if (savings) openings.push(["savings", cents(savings.openingBalanceCents)]);
  if (card) openings.push(["card", cents(card.openingBalanceCents)]);

  return {
    key: person.key,
    name: person.name,
    persona: person.persona,
    summary: person.summary,
    retirement: person.retirement ?? null,
    accounts: openings.map(([key, opening]) =>
      account(key, opening, kept, randomFor(seed, person.key, "mask", key)),
    ),
    transactions: kept,
  };
}

function account(
  key: AccountKey,
  opening: Cents,
  transactions: readonly GeneratedTransaction[],
  random: Random,
): GeneratedAccount {
  let balance = opening;
  let lowest = opening;
  const own = transactions.filter((t) => t.account === key);
  own.forEach((t, i) => {
    balance = add(balance, t.amount);
    const endOfDay = own[i + 1]?.postedOn !== t.postedOn;
    if (endOfDay && balance < lowest) lowest = balance;
  });
  return {
    key,
    ...ACCOUNT_INFO[key],
    mask: String(random.int(0, 9999)).padStart(4, "0"),
    openingBalance: opening,
    closingBalance: balance,
    lowestBalance: lowest,
  };
}

function byDate(a: GeneratedTransaction, b: GeneratedTransaction): number {
  return a.postedOn.localeCompare(b.postedOn);
}

function maxOf(a: Cents, b: Cents): Cents {
  return a > b ? a : b;
}

function minOf(a: Cents, b: Cents): Cents {
  return a < b ? a : b;
}
