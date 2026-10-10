import { formatCents, formatSigned } from "@/lib/money";
import type { MonthView } from "../domain/cashflow";
import { type IsoDate, formatLong } from "../domain/dates";
import { type Filter, Mark, matches } from "./month-grid";

/** The month as a list: only the days with activity, in order. */
export function Agenda({
  month,
  filter,
  selected,
  onSelect,
  cancelPlans,
}: {
  month: MonthView;
  filter: Filter;
  selected: IsoDate;
  onSelect: (date: IsoDate) => void;
  cancelPlans: ReadonlySet<string>;
}) {
  const days = month.days
    .map((day) => ({ day, items: day.items.filter(matches(filter)) }))
    .filter(({ items }) => items.length > 0);

  if (days.length === 0) {
    return <p className="agenda-empty">Nothing of this kind this month.</p>;
  }

  return (
    <ol className="agenda">
      {days.map(({ day, items }) => (
        <li key={day.date}>
          <button
            type="button"
            className="agenda-day"
            aria-pressed={day.date === selected}
            data-future={day.isFuture || undefined}
            onClick={() => onSelect(day.date)}
          >
            <span className="agenda-head">
              <span className="agenda-date">
                {formatLong(day.date)}
                {day.isToday && <span className="agenda-today">Today</span>}
              </span>
              <span className="agenda-balance">
                {day.isFuture ? "Expected balance" : "Balance"}{" "}
                {formatCents(day.endBalance)}
              </span>
            </span>
            {items.map((item) => (
              <span
                key={item.id}
                className={
                  item.recurringId && cancelPlans.has(item.recurringId)
                    ? "cell-line cell-line-cancelling"
                    : "cell-line"
                }
              >
                <Mark kind={item.kind} />
                <span className="cell-name">{item.name}</span>
                <span
                  className={
                    item.amount > 0
                      ? "cell-amount cell-amount-in"
                      : "cell-amount"
                  }
                >
                  {formatSigned(item.amount)}
                </span>
              </span>
            ))}
          </button>
        </li>
      ))}
    </ol>
  );
}
