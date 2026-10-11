import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import {
  METRICS,
  type SamplePerson,
  categoryRows,
  compareMetric,
  differenceText,
  peopleLikeYou,
  placementOf,
  rankIn,
  spreadOf,
  summarizeGroup,
  toneOf,
} from "./cohort";
import type { StoredMeasures } from "./metrics";

function person(
  i: number,
  measures: StoredMeasures,
  persona = "salaried",
): SamplePerson {
  return { workspaceId: `w${String(i).padStart(3, "0")}`, persona, measures };
}

// Take-home $1,000, $2,000 … $50,000 a month.
const fifty = Array.from({ length: 50 }, (_, i) =>
  person(i, { take_home: (i + 1) * 100_000 }),
);
const takeHomes = (group: SamplePerson[]) =>
  group.map((p) => p.measures.take_home! / 100_000);

describe("peopleLikeYou", () => {
  it("takes the 10 just below and the 10 just above you", () => {
    const group = peopleLikeYou(fifty, cents(2_550_000));
    expect(takeHomes(group)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 16),
    );
  });

  it("takes the 20 nearest at either end", () => {
    expect(takeHomes(peopleLikeYou(fifty, cents(0)))).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(takeHomes(peopleLikeYou(fifty, cents(99_000_000)))).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 31),
    );
    expect(takeHomes(peopleLikeYou(fifty, cents(300_000)))).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it("is everyone when the batch is small", () => {
    expect(peopleLikeYou(fifty.slice(0, 12), cents(500_000))).toHaveLength(12);
  });
});

describe("summarizeGroup", () => {
  it("gives the size, take-home range and persona mix", () => {
    const group = [
      person(1, { take_home: 300_000 }, "student"),
      person(2, { take_home: 200_000 }, "retiree"),
      person(3, { take_home: 450_000 }, "student"),
    ];
    expect(summarizeGroup(group)).toEqual({
      size: 3,
      takeHomeLow: 200_000,
      takeHomeHigh: 450_000,
      personas: [
        { persona: "student", people: 2 },
        { persona: "retiree", people: 1 },
      ],
    });
  });
});

describe("placement", () => {
  const spread = spreadOf([0, 10, 20, 30, 40]);

  it("reads the spread linearly between quartiles", () => {
    expect(spread).toEqual({
      lowest: 0,
      lowerQuartile: 10,
      median: 20,
      upperQuartile: 30,
      highest: 40,
    });
    expect(rankIn(-5, spread)).toBe(0);
    expect(rankIn(5, spread)).toBe(12.5);
    expect(rankIn(20, spread)).toBe(50);
    expect(rankIn(45, spread)).toBe(100);
    expect(rankIn(7, spreadOf([7, 7, 7]))).toBe(50);
  });

  it("puts ranks into five neutral places", () => {
    expect([0, 20, 50, 70, 100].map(placementOf)).toEqual([
      "lower",
      "a_bit_lower",
      "middle",
      "a_bit_higher",
      "higher",
    ]);
  });

  it("tints by which way reads as going well", () => {
    expect(toneOf("higher", "higher")).toBe("good");
    expect(toneOf("higher", "lower")).toBe("care");
    expect(toneOf("a_bit_lower", "lower")).toBe("fair");
    expect(toneOf("middle", "lower")).toBe("neutral");
  });
});

describe("compareMetric", () => {
  const group = [10, 20, 30, 40, 50].map((k, i) =>
    person(i, { take_home: 400_000, spending: k * 10_000, bills: k * 4_000 }),
  );

  it("compares money with a cents spread", () => {
    const spent = METRICS.find((m) => m.id === "spending")!;
    const c = compareMetric(spent, { spending: 450_000 }, group)!;
    expect(c.spread.median).toBe(300_000);
    expect(c.placement).toBe("higher");
    expect(c.tone).toBe("care");
    expect(c.people).toBe(5);
  });

  it("compares bills as a share of take-home", () => {
    const bills = METRICS.find((m) => m.id === "bills")!;
    const c = compareMetric(
      bills,
      { take_home: 400_000, bills: 100_000 },
      group,
    )!;
    expect(c.you).toBe(0.25);
    expect(c.spread.median).toBe(0.3);
    expect(c.placement).toBe("a_bit_lower");
  });

  it("has nothing to compare without your figure or the group's", () => {
    const lowest = METRICS.find((m) => m.id === "lowest_balance")!;
    expect(compareMetric(lowest, {}, group)).toBeNull();
    expect(compareMetric(lowest, { lowest_balance: 5 }, group)).toBeNull();
  });
});

describe("categoryRows", () => {
  const group = [1, 2, 3].map((k, i) =>
    person(i, {
      take_home: 400_000,
      "category:groceries": k * 20_000,
      "category:dining": k * 1_000,
    }),
  );

  it("lists categories you or the typical person spend on, biggest first", () => {
    const rows = categoryRows(
      {
        take_home: 200_000,
        "category:dining": 50_000,
        "category:uncategorized": 3_000,
      },
      group,
      { groceries: "Food" },
    );
    expect(rows.map((r) => [r.label, r.kind, r.you, r.typical])).toEqual([
      ["Dining", "Day-to-day", 50_000, 2_000],
      ["Food", "Day-to-day", 0, 40_000],
      ["Uncategorized", "Not categorized", 3_000, 0],
    ]);
    expect(rows[0]!.youShare).toBe(0.25);
    expect(rows[0]!.typicalShare).toBe(0.005);
    expect(rows[0]!.tone).toBe("care");
    expect(rows[2]!.tone).toBe("neutral");
  });

  it("leaves a category untinted when the typical person spends nothing on it", () => {
    const row = categoryRows(
      { take_home: 400_000, "category:health": 20_000 },
      group,
      {},
    ).find((r) => r.key === "health");
    expect(row).toMatchObject({ key: "health", typical: 0, tone: "neutral" });
  });

  it("has no shares without take-home", () => {
    const [row] = categoryRows({ "category:dining": 50_000 }, group, {});
    expect(row!.youShare).toBeNull();
  });
});

describe("differenceText", () => {
  const dollars = (v: number) => `$${v / 100}`;

  it("says about the same within $10 or 5%", () => {
    expect(differenceText(10_500, 10_000, "money", dollars)).toBe(
      "About the same as typical",
    );
    expect(differenceText(30_000, 10_000, "money", dollars)).toBe(
      "$200 more than typical",
    );
    expect(differenceText(0.1, 0.2, "share", String)).toBe(
      `${0.1} less than typical`,
    );
  });
});
