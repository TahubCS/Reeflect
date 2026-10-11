import type { PointerEvent } from "react";
import { formatCents } from "@/lib/money";
import type { DayView } from "../domain/cashflow";
import { type IsoDate, formatShort } from "../domain/dates";

/**
 * The month's balance, day by day: solid up to today, dashed for what is
 * expected. A picture of the calendar's own numbers, so it is hidden from
 * screen readers; the calendar cells carry the same balances.
 */
export function BalanceLine({
  days,
  selected,
  onSelect,
}: {
  days: DayView[];
  selected: IsoDate;
  onSelect: (date: IsoDate) => void;
}) {
  const balances = days.map((day) => day.endBalance);
  const low = Math.min(0, ...balances);
  const high = Math.max(...balances, low + 1);
  const x = (index: number) => ((index + 0.5) / days.length) * 100;
  const y = (index: number) =>
    92 - ((balances[index] - low) / (high - low)) * 80;
  const path = (from: number, to: number) =>
    days
      .slice(from, to + 1)
      .map((_, i) => `${i === 0 ? "M" : "L"} ${x(from + i)} ${y(from + i)}`)
      .join(" ");

  const lastReal = days.findLastIndex((day) => !day.isFuture);
  const todayIndex = days.findIndex((day) => day.isToday);
  const selectedIndex = days.findIndex((day) => day.date === selected);
  const last = days.length - 1;

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(
      ((event.clientX - box.left) / box.width) * days.length,
    );
    onSelect(days[Math.min(last, Math.max(0, index))].date);
  };

  return (
    <div className="line" aria-hidden="true" onPointerDown={pick}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          className="line-area"
          d={`${path(0, last)} L ${x(last)} 100 L ${x(0)} 100 Z`}
        />
        {lastReal >= 0 && <path className="line-real" d={path(0, lastReal)} />}
        {lastReal < last && (
          <path
            className="line-expected"
            d={path(Math.max(0, lastReal), last)}
          />
        )}
      </svg>
      {todayIndex >= 0 && (
        <span className="line-today" style={{ left: `${x(todayIndex)}%` }}>
          <span>Today</span>
        </span>
      )}
      {selectedIndex >= 0 && (
        <span
          className="line-dot"
          style={{ left: `${x(selectedIndex)}%`, top: `${y(selectedIndex)}%` }}
        >
          <span
            className={
              // Past the middle, the label opens to the left so it never
              // runs off a narrow screen.
              x(selectedIndex) > 50
                ? "line-label line-label-left"
                : "line-label"
            }
          >
            {formatShort(selected)}:{" "}
            {formatCents(days[selectedIndex].endBalance)}
          </span>
        </span>
      )}
    </div>
  );
}
