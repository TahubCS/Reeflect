"use client";

import { MotionConfig, motion } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";
import { APP_NAME } from "@/config/app";
import { absolute, formatCents, negate, times } from "@/lib/money";
import {
  type CashflowData,
  type Entry,
  type Summary,
  buildMonth,
  sourceCounts,
  subscriptionCosts,
  summarize,
} from "../domain/cashflow";
import {
  type IsoDate,
  type YearMonth,
  addMonths,
  formatLong,
  formatShort,
  monthName,
  monthOf,
  monthTitle,
  monthsApart,
  ordinal,
  parseIso,
  toIso,
} from "../domain/dates";
import { DEMO_DATA, TODAY } from "../domain/demo-data";
import { readText } from "../domain/read-text";
import { Agenda } from "./agenda";
import { BalanceLine } from "./balance-line";
import { DayPanel, type NewEntry } from "./day-panel";
import { type Filter, KIND_LABEL, Mark, MonthGrid } from "./month-grid";
import { TextThread } from "./text-thread";

/** How many months ahead the calendar can look. */
const MONTHS_AHEAD = 2;

const FILTERS: Filter[] = ["all", "income", "bill", "subscription", "everyday"];

/** A number that gives a small nudge whenever it changes. */
function Figure({ children }: { children: ReactNode }) {
  return (
    <motion.span
      key={String(children)}
      className="figure"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.span>
  );
}

/** The same sentence the headline uses, for the agent's replies. */
function standing(summary: Summary) {
  if (!summary.payday)
    return `You have ${formatCents(summary.balanceToday)} today.`;
  return `You have ${formatCents(summary.balanceToday)} today, and ${formatCents(summary.dueTotal)} is owed before payday on ${formatShort(summary.payday.date)}. That leaves about ${formatCents(summary.perDay)} a day.`;
}

export function CashflowDashboard() {
  const [data, setData] = useState<CashflowData>(DEMO_DATA);
  const [view, setView] = useState<YearMonth>(monthOf(TODAY));
  const [selected, setSelected] = useState<IsoDate>(TODAY);
  const [hovered, setHovered] = useState<IsoDate | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [layout, setLayout] = useState<"calendar" | "list">("calendar");
  const [cancelPlans, setCancelPlans] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const month = useMemo(() => buildMonth(data, view, TODAY), [data, view]);
  const summary = useMemo(() => summarize(data, TODAY), [data]);
  const subscriptions = useMemo(
    () => subscriptionCosts(data, cancelPlans),
    [data, cancelPlans],
  );
  const sources = useMemo(() => sourceCounts(data, TODAY), [data]);
  const day = month.days[parseIso(selected).day - 1];

  const offset = monthsApart(monthOf(TODAY), view);
  const showMonth = (next: YearMonth) => {
    setView(next);
    setHovered(null);
    setSelected(
      monthsApart(monthOf(TODAY), next) === 0
        ? TODAY
        : toIso(next.year, next.month, 1),
    );
  };

  const withEntry = (
    current: CashflowData,
    entry: Omit<Entry, "id">,
  ): CashflowData => ({
    ...current,
    entries: [...current.entries, { ...entry, id: crypto.randomUUID() }],
  });
  const addEntry = (entry: NewEntry) =>
    setData((current) =>
      withEntry(current, {
        date: selected,
        name: entry.name,
        amount: entry.amount,
        kind: entry.isIncome ? "income" : "everyday",
        category: entry.category,
        source: "manual",
      }),
    );
  const removeEntry = (id: string) =>
    setData((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== id),
    }));
  const toggleCancel = (id: string) =>
    setCancelPlans((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** Handles one text to the agent and returns its reply. */
  const receiveText = (text: string): string => {
    const intent = readText(text);
    if (intent.type === "unknown") {
      return 'I can log spending or tell you where you stand. Try "spent 12 on lunch" or "how am I doing?"';
    }
    if (intent.type === "status") return standing(summary);

    const isIncome = intent.type === "income";
    const next = withEntry(data, {
      date: TODAY,
      name: intent.name,
      amount: isIncome ? intent.amount : negate(intent.amount),
      kind: isIncome ? "income" : "everyday",
      category: intent.category,
      source: "text",
    });
    setData(next);
    showMonth(monthOf(TODAY));
    return `${isIncome ? "Added" : "Logged"} ${formatCents(intent.amount)} for ${intent.name}. ${standing(summarize(next, TODAY))}`;
  };

  const { payday } = summary;
  const dueCount = summary.dueBeforePayday.length;

  return (
    <MotionConfig reducedMotion="user">
      <div className="page">
        <header className="top">
          <p className="wordmark">{APP_NAME}</p>
          <p className="top-note">Sample data. Today is {formatLong(TODAY)}.</p>
        </header>

        <main>
          <section className="hero" aria-live="polite">
            {payday && summary.freeToSpend > 0 ? (
              <h1>
                You can spend about{" "}
                <Figure>{formatCents(summary.perDay)}</Figure> a day until
                payday.
              </h1>
            ) : payday ? (
              <h1>
                Your bills before payday will use all of today&rsquo;s balance.
              </h1>
            ) : (
              <h1>
                You have <Figure>{formatCents(summary.balanceToday)}</Figure>{" "}
                today.
              </h1>
            )}
            {payday && (
              <p className="hero-why">
                Payday is {formatLong(payday.date)}, {payday.daysAway}{" "}
                {payday.daysAway === 1 ? "day" : "days"} away.{" "}
                {dueCount > 0
                  ? `${dueCount} ${dueCount === 1 ? "payment comes" : "payments come"} out before then.`
                  : "Nothing else is due before then."}
              </p>
            )}
            <dl className="sums">
              <div>
                <dt>In your account today</dt>
                <dd>
                  <Figure>{formatCents(summary.balanceToday)}</Figure>
                </dd>
              </div>
              <div className="sums-op" aria-hidden="true">
                −
              </div>
              <div>
                <dt>Already owed before payday</dt>
                <dd>
                  <Figure>{formatCents(summary.dueTotal)}</Figure>
                </dd>
              </div>
              <div className="sums-op" aria-hidden="true">
                =
              </div>
              <div>
                <dt>Yours to spend</dt>
                <dd>
                  <Figure>{formatCents(summary.freeToSpend)}</Figure>
                </dd>
              </div>
            </dl>
          </section>

          <section className="calendar" aria-labelledby="month-heading">
            <div className="calendar-head">
              <h2 id="month-heading">{monthTitle(view)}</h2>
              <div className="month-nav">
                <button
                  type="button"
                  disabled={monthsApart(data.start, view) <= 0}
                  onClick={() => showMonth(addMonths(view, -1))}
                >
                  <span aria-hidden="true">‹</span> Earlier
                </button>
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => showMonth(monthOf(TODAY))}
                >
                  This month
                </button>
                <button
                  type="button"
                  disabled={offset >= MONTHS_AHEAD}
                  onClick={() => showMonth(addMonths(view, 1))}
                >
                  Later <span aria-hidden="true">›</span>
                </button>
              </div>
            </div>

            <BalanceLine
              days={month.days}
              selected={hovered ?? selected}
              onSelect={setSelected}
            />
            <p className="line-note">
              Your balance day by day. The dotted part is what&rsquo;s expected
              from paydays, bills and subscriptions; day-to-day spending
              isn&rsquo;t in it until it happens.
            </p>

            <div className="toolbar">
              <div className="chips" role="group" aria-label="Show">
                {FILTERS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={filter === option}
                    onClick={() => setFilter(option)}
                  >
                    {option === "all" ? (
                      "Everything"
                    ) : (
                      <>
                        <Mark kind={option} /> {KIND_LABEL[option]}
                      </>
                    )}
                  </button>
                ))}
              </div>
              <div className="chips" role="group" aria-label="Layout">
                <button
                  type="button"
                  aria-pressed={layout === "calendar"}
                  onClick={() => setLayout("calendar")}
                >
                  Calendar
                </button>
                <button
                  type="button"
                  aria-pressed={layout === "list"}
                  onClick={() => setLayout("list")}
                >
                  List
                </button>
              </div>
            </div>

            <div className="calendar-body">
              {layout === "calendar" ? (
                <MonthGrid
                  month={month}
                  filter={filter}
                  selected={selected}
                  onSelect={setSelected}
                  onHover={setHovered}
                  cancelPlans={cancelPlans}
                />
              ) : (
                <Agenda
                  month={month}
                  filter={filter}
                  selected={selected}
                  onSelect={setSelected}
                  cancelPlans={cancelPlans}
                />
              )}
              <DayPanel
                day={day}
                cancelPlans={cancelPlans}
                onAdd={addEntry}
                onRemove={removeEntry}
              />
            </div>
          </section>

          <div className="lower">
            <section aria-labelledby="noticed-heading">
              <h2 id="noticed-heading">
                What we noticed in {monthName(monthOf(TODAY))}
              </h2>
              <ul className="notes">
                <li>
                  <strong>{formatCents(summary.monthOut)}</strong> has gone out
                  so far
                  {summary.monthIn > 0 ? (
                    <>
                      , and <strong>{formatCents(summary.monthIn)}</strong> has
                      come in.
                    </>
                  ) : (
                    <>. Nothing has come in yet this month.</>
                  )}
                </li>
                {summary.biggestCategory && (
                  <li>
                    Most of your day-to-day spending went on{" "}
                    <strong>
                      {summary.biggestCategory.name.toLowerCase()}
                    </strong>
                    : {formatCents(summary.biggestCategory.total)} across{" "}
                    {summary.biggestCategory.count}{" "}
                    {summary.biggestCategory.count === 1
                      ? "purchase"
                      : "purchases"}
                    .
                  </li>
                )}
                <li>
                  {summary.noSpendDays > 0 ? (
                    <>
                      You&rsquo;ve had <strong>{summary.noSpendDays}</strong>{" "}
                      no-spend {summary.noSpendDays === 1 ? "day" : "days"} this
                      month. They&rsquo;re marked with a ✓ on the calendar.
                    </>
                  ) : (
                    <>
                      A day when nothing goes out gets a ✓ on the calendar. None
                      yet this month.
                    </>
                  )}
                </li>
              </ul>
            </section>

            <section aria-labelledby="subscription-heading">
              <h2 id="subscription-heading">Subscriptions</h2>
              <p className="lede">
                Your {subscriptions.count} subscriptions cost{" "}
                <strong>{formatCents(subscriptions.monthly)}</strong> a month.
                Over a year that&rsquo;s{" "}
                <strong>{formatCents(subscriptions.yearly)}</strong>.
              </p>
              <ul className="subs">
                {data.recurring
                  .filter((rule) => rule.kind === "subscription")
                  .map((rule) => {
                    const cancelling = cancelPlans.has(rule.id);
                    return (
                      <li key={rule.id}>
                        <Mark kind="subscription" />
                        <span className="item-text">
                          <span
                            className={
                              cancelling
                                ? "item-name item-cancelling"
                                : "item-name"
                            }
                          >
                            {rule.name}
                          </span>
                          <span className="item-note">
                            {formatCents(absolute(rule.amount))} on the{" "}
                            {ordinal(rule.day)},{" "}
                            {formatCents(times(absolute(rule.amount), 12))} a
                            year
                          </span>
                        </span>
                        <button
                          type="button"
                          className="plan"
                          aria-pressed={cancelling}
                          onClick={() => toggleCancel(rule.id)}
                        >
                          {cancelling ? "Planning to cancel" : "Keeping"}
                        </button>
                      </li>
                    );
                  })}
              </ul>
              <p className="saving" aria-live="polite">
                {subscriptions.markedCount > 0 ? (
                  <>
                    Cancelling the {subscriptions.markedCount} you marked would
                    keep{" "}
                    <strong>
                      <Figure>
                        {formatCents(subscriptions.yearlySavingIfCancelled)}
                      </Figure>
                    </strong>{" "}
                    a year in your pocket. Marking only records your plan; you
                    cancel with the provider yourself.
                  </>
                ) : (
                  <>
                    Not sure about one? Mark it to see what a year without it
                    would save.
                  </>
                )}
              </p>
            </section>

            <section aria-labelledby="sources-heading">
              <h2 id="sources-heading">Three ways your money gets here</h2>
              <ul className="sources">
                <li>
                  <span className="item-name">From your bank</span>
                  <span className="item-note">
                    Capital One checking (sample), synced today. {sources.bank}{" "}
                    this month.
                  </span>
                </li>
                <li>
                  <span className="item-name">Added by you</span>
                  <span className="item-note">
                    Cash and anything the bank misses. {sources.manual} this
                    month.
                  </span>
                </li>
                <li>
                  <span className="item-name">Texted to {APP_NAME}</span>
                  <span className="item-note">
                    A preview of the iMessage chat. {sources.text} this month.
                  </span>
                </li>
              </ul>
              <TextThread onSend={receiveText} />
            </section>
          </div>
        </main>

        <footer>
          Design preview with made-up numbers. No accounts are connected.
        </footer>
      </div>
    </MotionConfig>
  );
}
