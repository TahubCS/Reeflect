import { describe, expect, it } from "vitest";
import example from "../../../../tests/fixtures/synthetic/example-spec.json";
import { parseSpec } from "./spec";

type Json = Record<string, unknown>;
const copy = (): Json & { people: Json[] } => structuredClone(example);

function problems(input: unknown): string[] {
  const result = parseSpec(input);
  return result.ok ? [] : result.problems;
}

describe("parseSpec", () => {
  it("accepts the example spec and fills in defaults", () => {
    const result = parseSpec(copy());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dana = result.spec.people[0]!;
    expect(dana.events).toEqual([]);
    expect(dana.bills[0]!.account).toBe("checking");
    expect(dana.bills[0]!.cadence).toBe("monthly");
    expect(dana.spending[1]!.cardShare).toBe(0);
  });

  it("rejects a spec that is not an object, with a readable problem", () => {
    expect(problems("people")[0]).toMatch(/^\(spec\): /);
  });

  it("rejects duplicate person keys", () => {
    const spec = copy();
    spec.people[1]!.key = spec.people[0]!.key;
    expect(problems(spec)).toContain(
      'people.1.key: duplicate person key "p2p-01"',
    );
  });

  it("rejects a person who uses the card without having one", () => {
    const spec = copy();
    const retiree = spec.people[2] as { spending: Json[] };
    retiree.spending[0]!.cardShare = 10;
    expect(problems(spec)).toContain(
      "people.2.accounts.card: uses the card but has no card account",
    );
  });

  it.each([
    ["bills", 0],
    ["subscriptions", 0],
  ])("rejects a yearly %s item without a month", (list) => {
    const spec = copy();
    const items = (spec.people[2] as Record<string, Json[]>)[list]!;
    items[0] = { ...items[0], cadence: "yearly", month: undefined };
    expect(problems(spec)).toContain(
      `people.2.${list}.0.month: a yearly item needs its month`,
    );
  });

  it("rejects dates that do not exist", () => {
    const spec = copy();
    const tech = spec.people[1] as { events: Json[] };
    tech.events[0]!.date = "2026-02-30";
    expect(problems(spec)).toContain(
      "people.1.events.0.date: must be a real date",
    );
  });

  it("rejects asOf before the span starts", () => {
    expect(problems({ ...copy(), asOf: "2026-06-30" })).toContain(
      "asOf: asOf is before the span starts",
    );
  });

  it("accepts asOf inside the span", () => {
    expect(problems({ ...copy(), asOf: "2026-08-20" })).toEqual([]);
  });

  it("rejects a range whose min is above its max", () => {
    const spec = copy();
    const spending = (spec.people[0] as { spending: Json[] }).spending;
    spending[0]!.perMonth = { min: 9, max: 6 };
    expect(problems(spec)).toContain(
      "people.0.spending.0.perMonth: min must not be more than max",
    );
  });

  it.each([
    ["a zero amount", { amountCents: 0 }],
    ["a fractional amount", { amountCents: 12.5 }],
    ["a due day of 32", { day: 32 }],
  ])("rejects a bill with %s", (_, change) => {
    const spec = copy();
    const bills = (spec.people[0] as { bills: Json[] }).bills;
    bills[0] = { ...bills[0], ...change };
    expect(problems(spec).length).toBeGreaterThan(0);
  });

  it("rejects a zero event amount", () => {
    const spec = copy();
    const tech = spec.people[1] as { events: Json[] };
    tech.events[0]!.amountCents = 0;
    expect(problems(spec)).toContain(
      "people.1.events.0.amountCents: must not be zero",
    );
  });

  it("rejects a card that starts in credit", () => {
    const spec = copy();
    const card = (spec.people[0] as { accounts: { card: Json } }).accounts.card;
    card.openingBalanceCents = 500;
    expect(problems(spec).length).toBeGreaterThan(0);
  });

  it("accepts each retirement answer and investing, leaving both out by default (ADR-055)", () => {
    const plain = parseSpec(copy());
    expect(plain.ok && plain.spec.people[0]!.retirement).toBeUndefined();
    expect(plain.ok && plain.spec.people[0]!.investing).toEqual([]);

    const spec = copy();
    spec.people[0]!.retirement = { plan: "none" };
    spec.people[1]!.retirement = {
      plan: "employer",
      youMonthlyCents: 90_000,
      employerMonthlyCents: 0,
    };
    spec.people[1]!.investing = [
      { name: "SCHWAB BROKERAGE TRANSFER", amountCents: 50_000, day: 20 },
    ];
    spec.people[2]!.retirement = {
      plan: "own",
      name: "VANGUARD BUY INVESTMENT",
      amountCents: 25_000,
      day: 3,
    };
    expect(problems(spec)).toEqual([]);
  });

  it("rejects an employer plan nobody pays into, and an unknown plan", () => {
    const spec = copy();
    spec.people[0]!.retirement = {
      plan: "employer",
      youMonthlyCents: 0,
      employerMonthlyCents: 0,
    };
    spec.people[1]!.retirement = { plan: "pension" };
    const found = problems(spec);
    expect(found).toContain(
      "people.0.retirement: someone must be putting money in",
    );
    expect(found.some((p) => p.startsWith("people.1.retirement"))).toBe(true);
  });

  it("rejects an unknown persona and a bad start month", () => {
    const spec = copy();
    spec.people[0]!.persona = "investor";
    spec.startMonth = "2026-13";
    const found = problems(spec);
    expect(found.some((p) => p.startsWith("people.0.persona"))).toBe(true);
    expect(found).toContain("startMonth: must be YYYY-MM");
  });
});
