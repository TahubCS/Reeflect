import type { KeyboardEvent } from "react";
import { ZERO, formatCents, formatSigned, ratio, subtract } from "@/lib/money";
import type {
  DayView,
  Item,
  Kind,
  MonthView,
  Source,
} from "../domain/cashflow";
import { type IsoDate, WEEKDAYS, formatLong } from "../domain/dates";

export type Filter = Kind | "all";

export const KIND_LABEL: Record<Kind, string> = {
  income: "Money in",
  bill: "Bill",
  subscription: "Subscription",
  everyday: "Spending",
};

export const SOURCE_LABEL: Record<Source, string> = {
  bank: "from your bank",
  manual: "added by you",
  text: "texted in",
};

export const matches = (filter: Filter) => (item: Item) =>
  filter === "all" || item.kind === filter;

/** A small shape per kind, so the kind never depends on colour alone. */
export function Mark({ kind }: { kind: Kind }) {
  return <span className={`mark mark-${kind}`} aria-hidden="true" />;
}

/** How many lines of activity a cell lists before it says "+2 more". */
const LINES = 3;

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/**
 * What a day cell says to a screen reader. Every visual state has words
 * here (ADR-042): on card, planned and not confirmed, planning to cancel
 * (the cell shows that one only as a strikethrough).
 */
export function describeDay(day: DayView, cancelPlans: ReadonlySet<string>) {
  const parts = [formatLong(day.date)];
  if (day.isToday) parts.push("today");
  for (const item of day.items) {
    const cancelling = !!item.recurringId && cancelPlans.has(item.recurringId);
    parts.push(
      `${item.name} ${formatSigned(item.amount)}${item.onCard ? " on card" : ""}${item.unconfirmed ? " planned, not confirmed" : ""}${cancelling ? " planning to cancel" : ""}`,
    );
  }
  if (day.noSpend) parts.push("no-spend day");
  parts.push(
    `${day.isFuture ? "expected balance" : "balance"} ${formatCents(day.endBalance)}`,
  );
  return parts.join(", ");
}

function Cell({
  day,
  largest,
  filter,
  selected,
  onSelect,
  onHover,
  cancelPlans,
}: {
  day: DayView;
  largest: MonthView["largestEverydaySpend"];
  filter: Filter;
  selected: boolean;
  onSelect: (date: IsoDate) => void;
  onHover: (date: IsoDate | null) => void;
  cancelPlans: ReadonlySet<string>;
}) {
  const items = day.items.filter(matches(filter));
  const shown = items.slice(0, LINES);
  const cancelling = (item: Item) =>
    !!item.recurringId && cancelPlans.has(item.recurringId);
  const showBar =
    day.everydaySpent > 0 && (filter === "all" || filter === "everyday");
  const net = subtract(day.moneyIn, day.moneyOut);

  return (
    <button
      type="button"
      className="cell"
      aria-label={describeDay(day, cancelPlans)}
      aria-pressed={selected}
      // One tab stop for the whole grid; arrow keys move between days.
      tabIndex={selected ? 0 : -1}
      data-date={day.date}
      data-today={day.isToday || undefined}
      data-future={day.isFuture || undefined}
      data-quiet={(filter !== "all" && items.length === 0) || undefined}
      onClick={() => onSelect(day.date)}
      onMouseEnter={() => onHover(day.date)}
      onFocus={() => onHover(day.date)}
    >
      <span className="cell-top">
        <span className="cell-day">{day.day}</span>
        {net !== ZERO && filter === "all" && (
          <span className={net > 0 ? "cell-net cell-amount-in" : "cell-net"}>
            {formatSigned(net, { whole: true })}
          </span>
        )}
      </span>
      <span className="cell-lines">
        {day.noSpend && filter === "all" && (
          <span className="cell-line cell-nospend">
            <span aria-hidden="true">✓</span>
            <span className="cell-name">No-spend day</span>
          </span>
        )}
        {shown.map((item) => (
          <span
            key={item.id}
            className={
              cancelling(item)
                ? "cell-line cell-line-cancelling"
                : item.unconfirmed
                  ? "cell-line cell-line-unconfirmed"
                  : "cell-line"
            }
          >
            <Mark kind={item.kind} />
            <span className="cell-name">{item.name}</span>
            <span
              className={
                item.amount > 0 ? "cell-amount cell-amount-in" : "cell-amount"
              }
            >
              {formatSigned(item.amount, { whole: true })}
            </span>
          </span>
        ))}
        {items.length > shown.length && (
          <span className="cell-more">+{items.length - shown.length} more</span>
        )}
      </span>
      {showBar && (
        <span className="cell-bar">
          <span
            style={{
              width: `${Math.max(8, ratio(day.everydaySpent, largest) * 100)}%`,
            }}
          />
        </span>
      )}
    </button>
  );
}

export function MonthGrid({
  month,
  filter,
  selected,
  onSelect,
  onHover,
  cancelPlans,
}: {
  month: MonthView;
  filter: Filter;
  selected: IsoDate;
  onSelect: (date: IsoDate) => void;
  onHover: (date: IsoDate | null) => void;
  cancelPlans: ReadonlySet<string>;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEPS[event.key];
    if (!step) return;
    const index = month.days.findIndex((day) => day.date === selected) + step;
    const target = month.days[index];
    if (!target) return;
    event.preventDefault();
    onSelect(target.date);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-date="${target.date}"]`)
      ?.focus();
  };

  return (
    <div className="grid-wrap">
      <div className="weekdays" aria-hidden="true">
        {WEEKDAYS.map((name) => (
          <span key={name}>{name.slice(0, 3)}</span>
        ))}
      </div>
      <div
        className="grid"
        onKeyDown={onKeyDown}
        onMouseLeave={() => onHover(null)}
      >
        {Array.from({ length: month.leadingBlanks }, (_, i) => (
          <span key={i} className="cell cell-blank" />
        ))}
        {month.days.map((day) => (
          <Cell
            key={day.date}
            day={day}
            largest={month.largestEverydaySpend}
            filter={filter}
            selected={day.date === selected}
            onSelect={onSelect}
            onHover={onHover}
            cancelPlans={cancelPlans}
          />
        ))}
      </div>
      <p className="grid-hint">Arrow keys move between days.</p>
    </div>
  );
}
