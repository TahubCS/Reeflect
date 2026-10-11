// A workspace's stored rows → its measures. The one path for both a sample
// person's stored figures (`pnpm batch rollup`) and your own figures on the
// page, so the two are always worked out the same way (ADR-055).
import {
  type CategoryRule,
  type PresetKey,
  PRESET_CATEGORIES,
  classifyStored,
} from "@/features/categorization/client";
import type { Cents } from "@/lib/money";
import {
  type AccountKind,
  type MeasureKey,
  type Measures,
  type MetricRow,
  checkingBalanceAt,
  measure,
  toStored,
} from "./metrics";
import {
  type IsoDate,
  PERIOD_DAYS,
  type Period,
  type PeriodDays,
  periodEnding,
} from "./periods";

export type WorkspaceData = {
  accounts: readonly {
    id: string;
    type: AccountKind;
    balance: Cents;
    balanceAsOf: IsoDate | null;
  }[];
  /** Category id → its preset key. */
  categories: readonly { id: string; presetKey: string }[];
  rules: CategoryRule[];
  /** Rows from the period's first day on; later rows undo balances. */
  transactions: readonly {
    accountId: string;
    postedOn: IsoDate;
    amount: Cents;
    descriptionRaw: string;
    isTransfer: boolean;
    categoryId: string | null;
    categoryIsManual: boolean;
  }[];
  /** The workspace's first transaction date, over all time. */
  dataFrom: IsoDate | null;
};

const PRESET_KEYS = new Set<string>(PRESET_CATEGORIES.map((p) => p.key));
const isPresetKey = (key: string): key is PresetKey => PRESET_KEYS.has(key);

/** Effective categories (manual choice, else rule), as F-08 shows them. */
export function metricRows(data: WorkspaceData): MetricRow[] {
  const presetOf = new Map(
    data.categories
      .filter((c) => isPresetKey(c.presetKey))
      .map((c) => [c.id, c.presetKey as PresetKey]),
  );
  const typeOf = new Map(data.accounts.map((a) => [a.id, a.type]));
  return data.transactions.flatMap((t) => {
    const accountType = typeOf.get(t.accountId);
    if (accountType === undefined) return [];
    const result = classifyStored(t, data.rules);
    return [
      {
        postedOn: t.postedOn,
        amount: t.amount,
        isTransfer: t.isTransfer,
        presetKey: presetOf.get(result.categoryId ?? "") ?? null,
        accountType,
        merchant: result.merchantNormalized,
      },
    ];
  });
}

export function workspaceMeasures(
  data: WorkspaceData,
  period: Period,
): Measures | null {
  const checking = data.accounts
    .filter((a) => a.type === "checking")
    .map((a) => ({ id: a.id, balance: a.balance, asOf: a.balanceAsOf }));
  return measure(metricRows(data), {
    period,
    dataFrom: data.dataFrom,
    checkingAtEnd: checkingBalanceAt(
      period.to,
      checking,
      data.transactions.map((t) => ({
        accountId: t.accountId,
        postedOn: t.postedOn,
        amount: t.amount,
      })),
    ),
  });
}

/**
 * A sample person's stored figures for every period ending on the batch's
 * `asOf`: one `{ periodDays, measure, value }` per `insight_sample` row.
 */
export function sampleFigures(
  data: WorkspaceData,
  asOf: IsoDate,
): { periodDays: PeriodDays; measure: MeasureKey; value: number }[] {
  return PERIOD_DAYS.flatMap((days) => {
    const m = workspaceMeasures(data, periodEnding(asOf, days));
    if (m === null) return [];
    return Object.entries(toStored(m)).map(([measure, value]) => ({
      periodDays: days,
      measure: measure as MeasureKey,
      value: value!,
    }));
  });
}
