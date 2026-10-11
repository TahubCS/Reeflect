import { describe, expect, it } from "vitest";
import {
  PRESET_CATEGORIES,
  normalizeMerchant,
} from "@/features/categorization/client";
import {
  PRESET_FOR,
  type SpecInput,
  expandSpec,
  parseSpec,
  planCategories,
} from "@/features/synthetic";
import { cents } from "@/lib/money";
import example from "../../../../tests/fixtures/synthetic/example-spec.json";
import { measure } from "./metrics";
import { periodEnding } from "./periods";
import {
  type WorkspaceData,
  metricRows,
  sampleFigures,
  workspaceMeasures,
} from "./workspace";

const parsed = parseSpec(structuredClone(example) as SpecInput);
if (!parsed.ok) throw new Error(parsed.problems.join("\n"));
const expansion = expandSpec(parsed.spec, { seed: "insights-1" });

/** A sample person as the loader stores them: presets, rules, manual choices. */
function stored(index: number): WorkspaceData {
  const person = expansion.people[index]!;
  const plan = planCategories(person.transactions);
  const categories = PRESET_CATEGORIES.map((p) => ({
    id: `cat-${p.key}`,
    presetKey: p.key,
  }));
  return {
    accounts: person.accounts.map((a) => ({
      id: a.key,
      type: a.type,
      balance: a.closingBalance,
      balanceAsOf: expansion.asOf,
    })),
    categories,
    rules: plan.rules.map((r, i) => ({
      id: `rule-${i}`,
      categoryId: `cat-${r.presetKey}`,
      pattern: r.pattern,
      matchType: "exact",
      priority: 0,
    })),
    transactions: person.transactions.map((t) => {
      const planned = plan.byTransaction.get(t.id)!;
      return {
        accountId: t.account,
        postedOn: t.postedOn,
        amount: t.amount,
        descriptionRaw: t.description,
        isTransfer: t.transferPair !== null || t.kind === "investment",
        categoryId: planned.presetKey ? `cat-${planned.presetKey}` : null,
        categoryIsManual: planned.manual,
      };
    }),
    dataFrom: person.transactions
      .map((t) => t.postedOn)
      .reduce((a, b) => (a < b ? a : b)),
  };
}

describe("workspace measures", () => {
  it("categorize stored rows exactly as the generator meant them", () => {
    for (const [i, person] of expansion.people.entries()) {
      const rows = metricRows(stored(i));
      expect(rows.map((r) => r.presetKey)).toEqual(
        person.transactions.map((t) => PRESET_FOR[t.category]),
      );
      expect(rows.map((r) => r.merchant)).toEqual(
        person.transactions.map((t) => normalizeMerchant(t.description)),
      );
    }
  });

  it("end the lowest-balance walk on each checking account's closing balance", () => {
    const period = periodEnding(expansion.asOf, 30);
    const data = stored(0);
    const m = workspaceMeasures(data, period)!;
    const direct = measure(metricRows(data), {
      period,
      dataFrom: data.dataFrom,
      checkingAtEnd: data.accounts
        .filter((a) => a.type === "checking")
        .reduce((total, a) => cents(total + a.balance), cents(0)),
    });
    expect(m).toEqual(direct);
    // The generator tracks the true lowest; the window's low can't be below it.
    const checking = expansion.people[0]!.accounts.find(
      (a) => a.type === "checking",
    )!;
    expect(m.lowestBalance!).toBeGreaterThanOrEqual(checking.lowestBalance);
  });

  it("give every sample person figures for each period, ending on as-of", () => {
    const figures = sampleFigures(stored(1), expansion.asOf);
    expect(new Set(figures.map((f) => f.periodDays))).toEqual(
      new Set([30, 90, 365]),
    );
    const takeHome = figures.filter((f) => f.measure === "take_home");
    expect(takeHome).toHaveLength(3);
    for (const f of takeHome) expect(f.value).toBeGreaterThan(0);
    // Money into retirement and investing is never spending (ADR-055).
    expect(
      figures.some((f) => f.measure === ("category:retirement" as string)),
    ).toBe(false);
  });

  it("have nothing for a workspace without transactions", () => {
    expect(
      sampleFigures(
        {
          accounts: [],
          categories: [],
          rules: [],
          transactions: [],
          dataFrom: null,
        },
        "2026-10-10",
      ),
    ).toEqual([]);
  });
});
