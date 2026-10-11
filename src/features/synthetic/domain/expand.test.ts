import { describe, expect, it } from "vitest";
import { sum } from "@/lib/money";
import example from "../../../../tests/fixtures/synthetic/example-spec.json";
import { weekdayOf } from "./calendar";
import {
  type Expansion,
  type GeneratedPerson,
  GENERATOR_VERSION,
  expandSpec,
  spanEnd,
} from "./expand";
import { type Spec, type SpecInput, parseSpec } from "./spec";

function spec(change: (s: SpecInput) => void = () => {}): Spec {
  const input = structuredClone(example) as SpecInput;
  change(input);
  const result = parseSpec(input);
  if (!result.ok) throw new Error(result.problems.join("\n"));
  return result.spec;
}

const SEED = "seed-1";
const person = (e: Expansion, key: string): GeneratedPerson =>
  e.people.find((p) => p.key === key)!;
const rowsOf = (p: GeneratedPerson, account: string, kind?: string) =>
  p.transactions.filter(
    (t) => t.account === account && (kind === undefined || t.kind === kind),
  );

describe("expandSpec", () => {
  const expansion = expandSpec(spec(), { seed: SEED });
  const dana = person(expansion, "p2p-01");
  const priya = person(expansion, "tech-01");
  const walter = person(expansion, "retiree-01");

  it("records the generator version, seed and span", () => {
    expect(expansion).toMatchObject({
      generatorVersion: GENERATOR_VERSION,
      seed: SEED,
      startMonth: "2026-07",
      months: 3,
      asOf: "2026-09-30",
    });
    expect(spanEnd({ startMonth: "2026-11", months: 4 })).toBe("2027-02-28");
    // An asOf past the span's end stops at the span's end.
    const late = expandSpec(
      spec((s) => {
        s.asOf = "2026-12-01";
      }),
      { seed: SEED },
    );
    expect(late.asOf).toBe("2026-09-30");
  });

  it("is deterministic: same spec and seed, same rows", () => {
    expect(expandSpec(spec(), { seed: SEED })).toEqual(expansion);
  });

  it("changes with the seed", () => {
    const other = expandSpec(spec(), { seed: "seed-2" });
    expect(person(other, "p2p-01").transactions).not.toEqual(dana.transactions);
  });

  it("leaves earlier months unchanged when the span grows", () => {
    const longer = expandSpec(
      spec((s) => {
        s.months = 6;
      }),
      { seed: SEED },
    );
    for (const p of expansion.people) {
      const before = person(longer, p.key).transactions.filter(
        (t) => t.postedOn <= "2026-09-30",
      );
      expect(before).toEqual(p.transactions);
    }
  });

  it("generates nothing after asOf or before the span", () => {
    const capped = expandSpec(
      spec((s) => {
        s.asOf = "2026-08-20";
      }),
      { seed: SEED },
    );
    for (const p of capped.people) {
      for (const t of p.transactions) {
        expect(t.postedOn >= "2026-07-01" && t.postedOn <= "2026-08-20").toBe(
          true,
        );
      }
    }
  });

  it("puts paychecks in checking as money in, on the schedule", () => {
    const pay = rowsOf(dana, "checking", "income");
    expect(pay.map((t) => t.postedOn)).toEqual([
      "2026-07-03",
      "2026-07-17",
      "2026-07-31",
      "2026-08-14",
      "2026-08-28",
      "2026-09-11",
      "2026-09-25",
    ]);
    for (const t of pay) {
      expect(t.amount).toBeGreaterThan(0);
      // ±4% of $1,040.00
      expect(t.amount).toBeGreaterThanOrEqual(99_840);
      expect(t.amount).toBeLessThanOrEqual(108_160);
    }
  });

  it("moves weekend paydays back to Friday", () => {
    const dates = rowsOf(priya, "checking", "income").map((t) => t.postedOn);
    expect(dates).toContain("2026-08-14"); // the 15th is a Saturday
    expect(dates).toContain("2026-09-30"); // the 31st falls on the 30th
    for (const date of dates) expect([0, 6]).not.toContain(weekdayOf(date));
  });

  it("pays a moved payday from the next month inside the span", () => {
    // August 1 is a Saturday, so August's pension arrives on July 31.
    const pension = walter.transactions.filter(
      (t) => t.description === "NC RETIREMENT SYS PENSION",
    );
    expect(pension.map((t) => t.postedOn)).toEqual([
      "2026-07-01",
      "2026-07-31",
      "2026-09-01",
    ]);
  });

  it("pays Social Security on the second Wednesday", () => {
    const ssa = walter.transactions.filter((t) =>
      t.description.startsWith("SSA"),
    );
    expect(ssa.map((t) => t.postedOn)).toEqual([
      "2026-07-08",
      "2026-08-12",
      "2026-09-09",
    ]);
  });

  it("charges bills as money out, with the same amount each month unless they vary", () => {
    const rent = dana.transactions.filter(
      (t) => t.description === "Pine Hollow Apartments",
    );
    expect(rent.map((t) => t.amount)).toEqual([-97_500, -97_500, -97_500]);
    expect(
      rent.every((t) => t.kind === "bill" && t.category === "Housing"),
    ).toBe(true);
    const power = dana.transactions.filter(
      (t) => t.description === "Duke Energy",
    );
    expect(new Set(power.map((t) => t.amount)).size).toBeGreaterThan(1);
  });

  it("charges a yearly item only in its month", () => {
    const prime = priya.transactions.filter(
      (t) => t.description === "Amazon Prime",
    );
    expect(prime).toHaveLength(1);
    expect(prime[0]).toMatchObject({
      postedOn: "2026-08-22",
      account: "card",
      amount: -13_900,
      kind: "subscription",
      category: "Subscriptions",
    });
    const tax = walter.transactions.filter((t) =>
      t.description.includes("Property Tax"),
    );
    expect(tax.map((t) => t.postedOn)).toEqual(["2026-09-15"]);
  });

  it("puts every purchase on the account the spec says", () => {
    expect(rowsOf(priya, "checking", "everyday")).toEqual([]);
    const onCard = rowsOf(priya, "card", "everyday");
    expect(onCard.length).toBeGreaterThan(0);
    for (const t of onCard) expect(t.amount).toBeLessThan(0);
    expect(rowsOf(walter, "card")).toEqual([]);
  });

  it("includes one-off events", () => {
    expect(priya.transactions).toContainEqual(
      expect.objectContaining({
        postedOn: "2026-08-14",
        account: "card",
        amount: -48_620,
        kind: "event",
        category: "Travel",
      }),
    );
  });

  it("pairs every transfer: equal and opposite, different accounts, same day (ADR-020)", () => {
    for (const p of expansion.people) {
      const pairs = new Map<string, typeof p.transactions>();
      for (const t of p.transactions) {
        expect(t.kind === "transfer").toBe(t.transferPair !== null);
        if (t.transferPair === null) continue;
        pairs.set(t.transferPair, [...(pairs.get(t.transferPair) ?? []), t]);
      }
      for (const [, [a, b, ...rest]] of pairs) {
        expect(rest).toEqual([]);
        expect(a!.amount + b!.amount).toBe(0);
        expect(a!.account).not.toBe(b!.account);
        expect(a!.postedOn).toBe(b!.postedOn);
      }
    }
  });

  it("moves money to savings each month", () => {
    const saved = rowsOf(priya, "savings");
    expect(saved.map((t) => [t.postedOn, t.amount])).toEqual([
      ["2026-07-16", 120_000],
      ["2026-08-16", 120_000],
      ["2026-09-16", 120_000],
    ]);
    // A zero monthly transfer makes no rows.
    expect(rowsOf(walter, "savings")).toEqual([]);
  });

  it("pays into an IRA and a brokerage from checking each month, as saving (ADR-054)", () => {
    const saver = person(
      expandSpec(
        spec((s) => {
          s.people[1]!.retirement = {
            plan: "own",
            name: "VANGUARD BUY INVESTMENT",
            amountCents: 58_300,
            day: 3,
          };
          s.people[1]!.investing = [
            {
              name: "SCHWAB BROKERAGE TRANSFER",
              amountCents: 150_000,
              day: 20,
            },
          ];
        }),
        { seed: SEED },
      ),
      "tech-01",
    );
    const rows = saver.transactions.filter((t) => t.kind === "investment");
    expect(
      rows.map((t) => [t.postedOn, t.amount, t.account, t.category]),
    ).toEqual([
      ["2026-07-03", -58_300, "checking", "Retirement"],
      ["2026-07-20", -150_000, "checking", "Investing"],
      ["2026-08-03", -58_300, "checking", "Retirement"],
      ["2026-08-20", -150_000, "checking", "Investing"],
      ["2026-09-03", -58_300, "checking", "Retirement"],
      ["2026-09-20", -150_000, "checking", "Investing"],
    ]);
    // They leave the workspace, so there is no other side to pair with.
    expect(rows.every((t) => t.transferPair === null)).toBe(true);
    expect(saver.retirement).toMatchObject({ plan: "own" });
  });

  it("makes no rows for an employer plan or no plan, and records the answer", () => {
    const answered = expandSpec(
      spec((s) => {
        s.people[0]!.retirement = { plan: "none" };
        s.people[1]!.retirement = {
          plan: "employer",
          youMonthlyCents: 90_000,
          employerMonthlyCents: 45_000,
        };
      }),
      { seed: SEED },
    );
    expect(person(answered, "tech-01").retirement).toEqual({
      plan: "employer",
      youMonthlyCents: 90_000,
      employerMonthlyCents: 45_000,
    });
    expect(person(answered, "p2p-01").retirement).toEqual({ plan: "none" });
    expect(walter.retirement).toBeNull();
    // A 401(k) comes out before pay lands: the rows are the same as without it.
    answered.people.forEach((p, i) => {
      expect(p.transactions).toEqual(expansion.people[i]!.transactions);
    });
  });

  it("pays a card in full from the last statement", () => {
    const payments = rowsOf(priya, "card", "transfer");
    expect(payments[0]).toMatchObject({
      postedOn: "2026-07-05",
      amount: 142_315,
    });
    // August pays exactly what July put on the card.
    const july = rowsOf(priya, "card").filter(
      (t) => t.postedOn.startsWith("2026-07") && t.kind !== "transfer",
    );
    const julyCharges = sum(july.map((t) => t.amount));
    expect(payments[1]).toMatchObject({ postedOn: "2026-08-05" });
    expect(payments[1]!.amount).toBe(-julyCharges);
    expect(rowsOf(priya, "card", "interest")).toEqual([]);
  });

  it("pays the minimum and charges interest on what is carried", () => {
    const first = rowsOf(dana, "card", "transfer")[0]!;
    // 2% of $1,840.00 = $36.80, above the $25 floor.
    expect(first).toMatchObject({ postedOn: "2026-07-22", amount: 3_680 });
    const interest = rowsOf(dana, "card", "interest")[0]!;
    // ($1,840.00 − $36.80) × 28.99% / 12 = $43.56
    expect(interest).toMatchObject({
      postedOn: "2026-07-31",
      amount: -4_356,
      description: "INTEREST CHARGE:PURCHASES",
    });
  });

  it("gives each account a balance that adds up", () => {
    for (const p of expansion.people) {
      for (const account of p.accounts) {
        const moves = sum(rowsOf(p, account.key).map((t) => t.amount));
        expect(account.closingBalance).toBe(account.openingBalance + moves);
        expect(account.lowestBalance).toBeLessThanOrEqual(
          Math.min(account.openingBalance, account.closingBalance),
        );
        expect(account.mask).toMatch(/^\d{4}$/);
      }
    }
    expect(person(expansion, "p2p-01").accounts.map((a) => a.type)).toEqual([
      "checking",
      "credit_card",
    ]);
    expect(person(expansion, "retiree-01").accounts.map((a) => a.type)).toEqual(
      ["checking", "savings"],
    );
  });

  it("gives every transaction a unique, stable id", () => {
    const ids = expansion.people.flatMap((p) =>
      p.transactions.map((t) => t.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^p2p-01:2026-07:\d+$/);
  });

  it("returns transactions in date order", () => {
    for (const p of expansion.people) {
      const dates = p.transactions.map((t) => t.postedOn);
      expect([...dates].sort()).toEqual(dates);
    }
  });
});

describe("expandSpec schedules and card plans", () => {
  const one = (change: (p: SpecInput["people"][number]) => void) =>
    expandSpec(
      spec((s) => {
        s.people = [s.people[0]!];
        change(s.people[0]!);
      }),
      { seed: SEED },
    ).people[0]!;

  it("pays weekly on the given weekday", () => {
    const p = one((p) => {
      p.income = [
        {
          payer: "WEEKLY",
          amountCents: 50_000,
          schedule: { every: "week", weekday: 5 },
        },
      ];
    });
    const pay = rowsOf(p, "checking", "income");
    expect(pay).toHaveLength(13); // Fridays from July to September 2026
    for (const t of pay) expect(weekdayOf(t.postedOn)).toBe(5);
  });

  it("pays gig work a varying number of times within the range", () => {
    const p = one((p) => {
      p.income = [
        {
          payer: "DOORDASH DASHER",
          amountCents: 18_000,
          variationPct: 40,
          schedule: { every: "irregular", perMonth: { min: 2, max: 6 } },
        },
      ];
    });
    for (const month of ["2026-07", "2026-08", "2026-09"]) {
      const count = rowsOf(p, "checking", "income").filter((t) =>
        t.postedOn.startsWith(month),
      ).length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  it("caps a fixed card payment at what is owed and stops paying at zero", () => {
    const p = one((p) => {
      p.accounts.card = {
        openingBalanceCents: -10_000,
        aprBps: 2_000,
        payment: { kind: "fixed", amountCents: 50_000 },
        paymentDay: 10,
      };
      p.spending = p.spending!.map((s) => ({ ...s, cardShare: 0 }));
      p.subscriptions = [];
    });
    const payments = rowsOf(p, "card", "transfer");
    expect(payments.map((t) => t.amount)).toEqual([10_000]);
    expect(rowsOf(p, "card", "interest")).toEqual([]);
    expect(p.accounts.find((a) => a.key === "card")!.closingBalance).toBe(0);
  });

  it("uses the $25 floor for a small minimum payment and charges no interest at 0% APR", () => {
    const p = one((p) => {
      p.accounts.card = {
        openingBalanceCents: -50_000,
        aprBps: 0,
        payment: { kind: "minimum" },
        paymentDay: 10,
      };
    });
    expect(rowsOf(p, "card", "transfer")[0]!.amount).toBe(2_500);
    expect(rowsOf(p, "card", "interest")).toEqual([]);
  });
});

describe("expandSpec in whole-dollar mode (Nessie, ADR-048)", () => {
  const whole = expandSpec(spec(), { seed: SEED, wholeDollars: true });

  it("emits no cents and no zero amounts", () => {
    for (const p of whole.people) {
      for (const t of p.transactions) {
        expect(Math.abs(t.amount) % 100).toBe(0);
        expect(t.amount).not.toBe(0);
      }
    }
  });

  it("rounds amounts under a dollar up to one dollar, keeping the sign", () => {
    const p = expandSpec(
      spec((s) => {
        s.people = [s.people[1]!];
        s.people[0]!.subscriptions = [
          { name: "Tiny app", amountCents: 49, day: 2, account: "card" },
        ];
        s.people[0]!.events = [
          {
            date: "2026-07-09",
            description: "Refund",
            amountCents: 75,
            category: "Other",
          },
        ];
      }),
      { seed: SEED, wholeDollars: true },
    ).people[0]!;
    const tiny = p.transactions.filter((t) => t.description === "Tiny app");
    expect(tiny.every((t) => t.amount === -100)).toBe(true);
    expect(p.transactions.find((t) => t.description === "Refund")!.amount).toBe(
      100,
    );
  });

  it("drops interest that rounds to zero dollars", () => {
    const p = expandSpec(
      spec((s) => {
        s.people = [s.people[0]!];
        s.people[0]!.accounts.card = {
          openingBalanceCents: -3_000,
          aprBps: 1_000,
          payment: { kind: "fixed", amountCents: 1_000 },
          paymentDay: 28,
        };
        s.people[0]!.spending = [];
        s.people[0]!.subscriptions = [];
      }),
      { seed: SEED, wholeDollars: true },
    ).people[0]!;
    // $20 carried × 10% / 12 = $0.17, which is $0 in whole dollars.
    expect(rowsOf(p, "card", "interest")).toEqual([]);
  });
});
