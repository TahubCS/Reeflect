// Who you are compared with, and where you fall (ADR-055). Pure: works on
// stored sample figures, never on anyone's transactions.
import { PRESET_CATEGORIES } from "@/features/categorization/client";
import { type Cents, cents, fiveNumbers, ratio } from "@/lib/money";
import {
  BILL_PRESETS,
  type MeasureKey,
  type SpendingKey,
  type StoredMeasures,
} from "./metrics";

export type SamplePerson = {
  workspaceId: string;
  persona: string;
  measures: StoredMeasures;
};

export const COMPARE_WITH = ["like_you", "everyone"] as const;
export type CompareWith = (typeof COMPARE_WITH)[number];

/** People just below and just above you by take-home (ADR-055). */
export const NEIGHBOURS_EACH_SIDE = 10;

const takeHomeOf = (p: SamplePerson) => p.measures.take_home ?? 0;

/**
 * The 10 sample people just below you and the 10 just above by take-home;
 * at either end of the range, the 20 nearest. Everyone when the batch has
 * 20 people or fewer.
 */
export function peopleLikeYou(
  samples: readonly SamplePerson[],
  takeHome: Cents,
): SamplePerson[] {
  const size = NEIGHBOURS_EACH_SIDE * 2;
  const sorted = [...samples].sort(
    (a, b) =>
      takeHomeOf(a) - takeHomeOf(b) ||
      a.workspaceId.localeCompare(b.workspaceId),
  );
  if (sorted.length <= size) return sorted;
  const below = sorted.filter((p) => takeHomeOf(p) < takeHome).length;
  const start = Math.min(
    Math.max(below - NEIGHBOURS_EACH_SIDE, 0),
    sorted.length - size,
  );
  return sorted.slice(start, start + size);
}

export type GroupSummary = {
  size: number;
  takeHomeLow: Cents;
  takeHomeHigh: Cents;
  /** Most common first. */
  personas: { persona: string; people: number }[];
};

export function summarizeGroup(group: readonly SamplePerson[]): GroupSummary {
  const takeHomes = group.map((p) => cents(takeHomeOf(p)));
  const counts = new Map<string, number>();
  for (const p of group)
    counts.set(p.persona, (counts.get(p.persona) ?? 0) + 1);
  return {
    size: group.length,
    takeHomeLow: cents(takeHomes.length ? Math.min(...takeHomes) : 0),
    takeHomeHigh: cents(takeHomes.length ? Math.max(...takeHomes) : 0),
    personas: [...counts]
      .map(([persona, people]) => ({ persona, people }))
      .sort(
        (a, b) => b.people - a.people || a.persona.localeCompare(b.persona),
      ),
  };
}

// Measures shown as "where you stand".

export type Unit = "money" | "count" | "share";
/** Which way reads as going well; it only sets the tint, never the words. */
export type Better = "higher" | "lower";

export type Metric = {
  id: string;
  label: string;
  /** Under the value: "a month", "of take-home". */
  per: string;
  unit: Unit;
  better: Better;
  read: (m: StoredMeasures) => number | null;
};

const stored = (key: MeasureKey) => (m: StoredMeasures) => m[key] ?? null;
const shareOfTakeHome = (key: MeasureKey) => (m: StoredMeasures) =>
  (m.take_home ?? 0) > 0
    ? ratio(cents(m[key] ?? 0), cents(m.take_home!))
    : null;

export const METRICS: readonly Metric[] = [
  {
    id: "kept",
    label: "Kept after spending",
    per: "a month",
    unit: "money",
    better: "higher",
    read: stored("kept"),
  },
  {
    id: "saved",
    label: "Moved to savings, retirement and investing",
    per: "a month",
    unit: "money",
    better: "higher",
    read: stored("saved"),
  },
  {
    id: "spending",
    label: "Spent",
    per: "a month",
    unit: "money",
    better: "lower",
    read: stored("spending"),
  },
  {
    id: "bills",
    label: "Bills",
    per: "of take-home",
    unit: "share",
    better: "lower",
    read: shareOfTakeHome("bills"),
  },
  {
    id: "subscription_cost",
    label: "Subscriptions",
    per: "a month",
    unit: "money",
    better: "lower",
    read: stored("subscription_cost"),
  },
  {
    id: "subscription_count",
    label: "Subscriptions paid for",
    per: "in this period",
    unit: "count",
    better: "lower",
    read: stored("subscription_count"),
  },
  {
    id: "lowest_balance",
    label: "Lowest checking balance",
    per: "in this period",
    unit: "money",
    better: "higher",
    read: stored("lowest_balance"),
  },
  {
    id: "no_spend_days",
    label: "No-spend days",
    per: "a month",
    unit: "count",
    better: "higher",
    read: stored("no_spend_days"),
  },
];

export type Spread = {
  lowest: number;
  lowerQuartile: number;
  median: number;
  upperQuartile: number;
  highest: number;
};

/** Shares and counts: the same method as money's `quantile`, unrounded. */
export function spreadOf(values: readonly number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    if (sorted.length === 0) return 0;
    const i = (sorted.length - 1) * p;
    const lo = sorted[Math.floor(i)]!;
    return lo + (sorted[Math.ceil(i)]! - lo) * (i - Math.floor(i));
  };
  return {
    lowest: at(0),
    lowerQuartile: at(0.25),
    median: at(0.5),
    upperQuartile: at(0.75),
    highest: at(1),
  };
}

function spreadFor(unit: Unit, values: readonly number[]): Spread {
  return unit === "money" ? fiveNumbers(values.map(cents)) : spreadOf(values);
}

/** Roughly where `value` sits in the group, 0 to 100, from its spread. */
export function rankIn(value: number, s: Spread): number {
  const points = [
    s.lowest,
    s.lowerQuartile,
    s.median,
    s.upperQuartile,
    s.highest,
  ];
  if (s.lowest === s.highest) return 50;
  if (value <= s.lowest) return 0;
  if (value >= s.highest) return 100;
  for (let i = 0; i < 4; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (value <= b) {
      // Several people at one value: the middle of that stretch.
      if (a === b) return i * 25 + 12.5;
      return i * 25 + (25 * (value - a)) / (b - a);
    }
  }
  return 50;
}

export type Placement =
  "lower" | "a_bit_lower" | "middle" | "a_bit_higher" | "higher";

export function placementOf(rank: number): Placement {
  if (rank < 15) return "lower";
  if (rank < 40) return "a_bit_lower";
  if (rank <= 60) return "middle";
  if (rank <= 85) return "a_bit_higher";
  return "higher";
}

/** Neutral words: a position, never a judgement (ADR-042). */
export const PLACEMENT_TEXT: Record<Placement, string> = {
  lower: "Lower than most of this group",
  a_bit_lower: "A bit lower than typical",
  middle: "Near the middle of this group",
  a_bit_higher: "A bit higher than typical",
  higher: "Higher than most of this group",
};

/** A slight tint: green-ish when going well, warm when not; text carries the meaning. */
export type Tone = "good" | "fair" | "neutral" | "watch" | "care";

export function toneOf(placement: Placement, better: Better): Tone {
  const up = better === "higher";
  switch (placement) {
    case "lower":
      return up ? "care" : "good";
    case "a_bit_lower":
      return up ? "watch" : "fair";
    case "middle":
      return "neutral";
    case "a_bit_higher":
      return up ? "fair" : "watch";
    case "higher":
      return up ? "good" : "care";
  }
}

export type Comparison = {
  metric: Metric;
  you: number;
  spread: Spread;
  placement: Placement;
  tone: Tone;
  /** People in the group with a value for this measure. */
  people: number;
};

export function compareMetric(
  metric: Metric,
  you: StoredMeasures,
  group: readonly SamplePerson[],
): Comparison | null {
  const yours = metric.read(you);
  const values = group
    .map((p) => metric.read(p.measures))
    .filter((v): v is number => v !== null);
  if (yours === null || values.length === 0) return null;
  const spread = spreadFor(metric.unit, values);
  const placement = placementOf(rankIn(yours, spread));
  return {
    metric,
    you: yours,
    spread,
    placement,
    tone: toneOf(placement, metric.better),
    people: values.length,
  };
}

// Spending by category: you next to the group's typical person.

export type CategoryRow = {
  key: SpendingKey;
  label: string;
  kind: "Bill" | "Subscription" | "Day-to-day" | "Not categorized";
  you: Cents;
  typical: Cents;
  /** Shares of take-home; null when take-home is zero. */
  youShare: number | null;
  typicalShare: number | null;
  tone: Tone;
};

const SPENDING_KEYS: readonly SpendingKey[] = [
  ...PRESET_CATEGORIES.map((p) => p.key).filter(
    (key): key is Exclude<SpendingKey, "uncategorized"> =>
      key !== "income" && key !== "retirement" && key !== "investing",
  ),
  "uncategorized",
];

function kindOf(key: SpendingKey): CategoryRow["kind"] {
  if (key === "uncategorized") return "Not categorized";
  if (key === "subscriptions") return "Subscription";
  if ((BILL_PRESETS as readonly string[]).includes(key)) return "Bill";
  return "Day-to-day";
}

/**
 * One row per category that you or the typical person spend on, biggest
 * first. `names` are your workspace's category names (renames show), by
 * preset key.
 */
export function categoryRows(
  you: StoredMeasures,
  group: readonly SamplePerson[],
  names: Partial<Record<string, string>>,
): CategoryRow[] {
  const rows: CategoryRow[] = [];
  for (const key of SPENDING_KEYS) {
    const measure = `category:${key}` as const;
    const metric: Metric = {
      id: measure,
      label: "",
      per: "",
      unit: "money",
      better: "lower",
      read: (m) => m[measure] ?? 0,
    };
    const yours = cents(you[measure] ?? 0);
    const amounts = group.map((p) => cents(p.measures[measure] ?? 0));
    const typical = fiveNumbers(amounts).median;
    if (yours <= 0 && typical <= 0) continue;
    const shares = group
      .map((p) => shareOfTakeHome(measure)(p.measures))
      .filter((v): v is number => v !== null);
    const comparison = compareMetric(metric, you, group);
    rows.push({
      key,
      label:
        key === "uncategorized"
          ? "Uncategorized"
          : (names[key] ?? labelOf(key)),
      kind: kindOf(key),
      you: yours,
      typical,
      youShare: shareOfTakeHome(measure)(you),
      typicalShare: shares.length ? spreadOf(shares).median : null,
      // No tint for Uncategorized, or where the typical person spends
      // nothing: most people simply don't have that category.
      tone:
        key === "uncategorized" || typical <= 0 || !comparison
          ? "neutral"
          : comparison.tone,
    });
  }
  return rows.sort(
    (a, b) => Math.max(b.you, b.typical) - Math.max(a.you, a.typical),
  );
}

function labelOf(key: SpendingKey): string {
  return PRESET_CATEGORIES.find((p) => p.key === key)?.name ?? key;
}

/** "About the same", or how far apart, for the category list. */
export function differenceText(
  you: number,
  typical: number,
  unit: "money" | "share",
  format: (value: number) => string,
): string {
  const gap = you - typical;
  const close =
    unit === "money"
      ? Math.abs(gap) < Math.max(1_000, Math.abs(typical) * 0.05)
      : Math.abs(gap) < 0.005;
  if (close) return "About the same as typical";
  return `${format(Math.abs(gap))} ${gap > 0 ? "more" : "less"} than typical`;
}
