import { describe, expect, it } from "vitest";
import example from "../../../../tests/fixtures/synthetic/example-spec.json";
import {
  checkExpansion,
  checkSpec,
  monthlyFixedCosts,
  monthlyIncome,
  daysCovered,
  personStats,
  statsWindow,
} from "./check";
import { expandSpec } from "./expand";
import { type Schedule, type Spec, type SpecInput, parseSpec } from "./spec";

function spec(change: (s: SpecInput) => void = () => {}): Spec {
  const input = structuredClone(example) as SpecInput;
  change(input);
  const result = parseSpec(input);
  if (!result.ok) throw new Error(result.problems.join("\n"));
  return result.spec;
}

const person = (change: (p: SpecInput["people"][number]) => void) =>
  spec((s) => {
    s.people = [s.people[0]!];
    change(s.people[0]!);
  }).people[0]!;

describe("monthlyIncome", () => {
  it.each([
    [{ every: "week", weekday: 5 }, 433_333], // $1,000 × 52 / 12
    [{ every: "two_weeks", anchor: "2026-07-03" }, 216_667],
    [{ every: "half_month", days: [15, 31] }, 200_000],
    [{ every: "month", day: 1 }, 100_000],
    [{ every: "month_weekday", nth: 2, weekday: 3 }, 100_000],
    [{ every: "irregular", perMonth: { min: 1, max: 4 } }, 250_000],
  ] as [Schedule, number][])("averages %j", (schedule, expected) => {
    const p = person((p) => {
      p.income = [{ payer: "PAY", amountCents: 100_000, schedule }];
    });
    expect(monthlyIncome(p)).toBe(expected);
  });
});

describe("monthlyFixedCosts", () => {
  it("counts a yearly charge as a twelfth", () => {
    const p = person((p) => {
      p.bills = [
        { name: "Rent", amountCents: 100_000, day: 1, category: "Housing" },
        {
          name: "Tax",
          amountCents: 120_000,
          day: 1,
          cadence: "yearly",
          month: 9,
          category: "Housing",
        },
      ];
      p.subscriptions = [{ name: "App", amountCents: 1_000, day: 3 }];
    });
    expect(monthlyFixedCosts(p)).toBe(111_000);
  });
});

describe("checkSpec", () => {
  it("finds nothing wrong with the example", () => {
    expect(checkSpec(spec())).toEqual([]);
  });

  it("flags take-home outside the persona's band", () => {
    const s = spec((s) => {
      s.people[0]!.persona = "upper_middle_tech";
    });
    expect(checkSpec(s)).toContainEqual({
      person: "p2p-01",
      message:
        "take-home $27,040 a year is outside the upper_middle_tech band ($75,000–$175,000)",
    });
  });

  it("flags fixed costs that eat all the income, and no income at all", () => {
    const s = spec((s) => {
      s.people[0]!.bills![0]!.amountCents = 300_000;
      s.people[1]!.income = [];
    });
    const messages = checkSpec(s).map((w) => `${w.person}: ${w.message}`);
    expect(messages).toContain(
      "p2p-01: fixed costs $3,145.99 a month are not less than take-home $2,253.33",
    );
    expect(messages.some((m) => m.startsWith("tech-01: fixed costs"))).toBe(
      true,
    );
  });

  it("flags fewer than two bills", () => {
    const s = spec((s) => {
      s.people[0]!.bills = s.people[0]!.bills!.slice(0, 1);
    });
    expect(checkSpec(s)).toContainEqual({
      person: "p2p-01",
      message: "has fewer than 2 recurring bills",
    });
  });

  it("flags two people with identical numbers", () => {
    const s = spec((s) => {
      s.people.push({ ...structuredClone(s.people[0]!), key: "p2p-02" });
    });
    expect(checkSpec(s)).toContainEqual({
      person: "p2p-02",
      message: "has the same income and fixed costs as p2p-01",
    });
  });
});

describe("personStats and checkExpansion", () => {
  it("finds nothing wrong with the example's rows", () => {
    expect(checkExpansion(expandSpec(spec(), { seed: "seed-1" }))).toEqual([]);
  });

  it("averages income and spending per month, leaving out transfers", () => {
    const expansion = expandSpec(spec(), { seed: "seed-1" });
    const walter = expansion.people[2]!;
    const stats = personStats(walter, expansion);
    // Six deposits ($9,510) over July 1 to September 30 (92 days):
    // $9,510 × 30.4375 / 92 = $3,146.31 a month.
    expect(daysCovered(expansion)).toBe(92);
    expect(stats.incomePerMonth).toBe(314_631);
    expect(stats.otherInPerMonth).toBe(0);
    expect(stats.spendingPerMonth).toBeGreaterThan(0);
    expect(stats.transactions).toBe(walter.transactions.length);
    expect(stats.closingChecking).toBe(walter.accounts[0]!.closingBalance);
  });

  it("leaves money into retirement and investing out of spending (ADR-053)", () => {
    const base = expandSpec(spec(), { seed: "seed-1" });
    const saving = expandSpec(
      spec((s) => {
        s.people[1]!.investing = [
          { name: "SCHWAB BROKERAGE TRANSFER", amountCents: 150_000, day: 20 },
        ];
      }),
      { seed: "seed-1" },
    );
    const before = personStats(base.people[1]!, base);
    const after = personStats(saving.people[1]!, saving);
    expect(after.spendingPerMonth).toBe(before.spendingPerMonth);
    expect(after.closingChecking).toBe(before.closingChecking - 450_000);
  });

  it("flags an overdrawn checking account and spending above income", () => {
    const s = spec((s) => {
      s.people = [s.people[0]!];
      s.people[0]!.accounts.checking.openingBalanceCents = 0;
      s.people[0]!.spending!.push({
        category: "Shopping",
        merchants: ["Big Box"],
        perMonth: { min: 10, max: 10 },
        amountCents: { min: 30_000, max: 30_000 },
      });
    });
    const messages = checkExpansion(expandSpec(s, { seed: "seed-1" })).map(
      (w) => w.message,
    );
    expect(
      messages.some((m) => m.startsWith("checking goes as low as -$")),
    ).toBe(true);
    expect(messages.some((m) => m.startsWith("spends $"))).toBe(true);
  });

  it("measures through the last complete month", () => {
    const base = expandSpec(spec(), { seed: "s" });
    const at = (asOf: string, months = 4) =>
      statsWindow({ ...base, startMonth: "2026-07", months, asOf });
    expect(at("2026-10-10").asOf).toBe("2026-09-30");
    expect(at("2026-09-30").asOf).toBe("2026-09-30");
    // Inside the first month there is no complete month: use what there is.
    expect(at("2026-07-20", 1).asOf).toBe("2026-07-20");
  });

  it("averages over the days generated when the span ends mid-month", () => {
    const expansion = expandSpec(
      spec((s) => {
        s.asOf = "2026-09-10";
      }),
      { seed: "seed-1" },
    );
    expect(daysCovered(expansion)).toBe(72);
    const walter = personStats(expansion.people[2]!, expansion);
    // All six deposits ($9,510) arrive by September 10, in 72 days.
    expect(walter.incomePerMonth).toBe(402_029);
  });

  it("counts one-off money in, such as aid, as coming in", () => {
    const s = spec((s) => {
      s.people = [s.people[2]!];
      s.people[0]!.income = [];
      s.people[0]!.events = [
        {
          date: "2026-07-15",
          description: "FIN AID REFUND",
          amountCents: 1_000_000,
          category: "Other",
        },
      ];
    });
    const expansion = expandSpec(s, { seed: "seed-1" });
    expect(personStats(expansion.people[0]!, expansion).otherInPerMonth).toBe(
      330_842,
    );
    expect(checkExpansion(expansion).map((w) => w.message)).not.toContainEqual(
      expect.stringMatching(/^spends/),
    );
  });

  it("does not compare spending with income when there is no income", () => {
    const s = spec((s) => {
      s.people = [s.people[2]!];
      s.people[0]!.income = [];
    });
    const messages = checkExpansion(expandSpec(s, { seed: "seed-1" })).map(
      (w) => w.message,
    );
    expect(messages.some((m) => m.startsWith("spends"))).toBe(false);
  });
});
