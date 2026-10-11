"use client";

import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { APP_NAME } from "@/config/app";
import { cadenceLabel } from "@/features/recurring/client";
import { absolute, formatCents } from "@/lib/money";
import {
  type Recurring,
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
  monthChipLabel,
  monthName,
  monthOf,
  monthPrefix,
  monthRange,
  monthTitle,
  monthsApart,
  parseIso,
  toIso,
} from "../domain/dates";
import { MONTHS_AHEAD, UNCATEGORIZED } from "../domain/from-records";
import { setSubscriptionIntentAction } from "../server/actions";
import type { Dashboard } from "../server/load";
import { Agenda } from "./agenda";
import { BalanceLine } from "./balance-line";
import { DayPanel } from "./day-panel";
import { type Filter, KIND_LABEL, Mark, MonthGrid } from "./month-grid";

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

/** What the Settings page says about texting, in one line. */
function textingNote(linkState: Dashboard["linkState"]) {
  if (linkState.status === "linked")
    return `Your phone (${linkState.handleLabel}) is linked.`;
  if (linkState.status === "pending")
    return "Your phone is waiting to be approved in Settings.";
  return "Link your phone in Settings to log spending by text.";
}

function EmptyMonth({ workspaceId }: { workspaceId: string }) {
  return (
    <section className="hero hero-empty">
      <h1>Add an account to see your month.</h1>
      <p className="hero-why">
        Add your checking account and its balance, or import a statement. Your
        paydays, bills and spending then fill in the calendar.
      </p>
      <p className="hero-actions">
        <Link className="primary" href={`/w/${workspaceId}/accounts/new`}>
          Add an account
        </Link>
        <Link href={`/w/${workspaceId}/import`}>Import a statement</Link>
      </p>
    </section>
  );
}

export function CashflowDashboard({
  workspaceId,
  data,
  today,
  accounts,
  categories,
  canEdit,
  linkState,
  suggestions,
}: Dashboard) {
  const [view, setView] = useState<YearMonth>(monthOf(today));
  const [selected, setSelected] = useState<IsoDate>(today);
  const [hovered, setHovered] = useState<IsoDate | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [layout, setLayout] = useState<"calendar" | "list">("calendar");
  // Saved on Recurring payments (ADR-058); a tap shows at once while it saves.
  const savedPlans = useMemo(
    () =>
      new Set(
        data.recurring
          .filter((rule) => rule.userIntent === "cancel")
          .map((rule) => rule.id),
      ) as ReadonlySet<string>,
    [data],
  );
  const [cancelPlans, planCancel] = useOptimistic(
    savedPlans,
    (current, change: { id: string; cancelling: boolean }) => {
      const next = new Set(current);
      if (change.cancelling) next.add(change.id);
      else next.delete(change.id);
      return next as ReadonlySet<string>;
    },
  );
  const [, startSaving] = useTransition();

  const month = useMemo(
    () => buildMonth(data, view, today),
    [data, view, today],
  );
  const summary = useMemo(() => summarize(data, today), [data, today]);
  const subscriptions = useMemo(
    () => subscriptionCosts(data, cancelPlans),
    [data, cancelPlans],
  );
  const sources = useMemo(() => sourceCounts(data, today), [data, today]);
  const day = month.days[parseIso(selected).day - 1];

  const offset = monthsApart(monthOf(today), view);
  const months = useMemo(
    () => monthRange(data.start, addMonths(monthOf(today), MONTHS_AHEAD)),
    [data.start, today],
  );
  // Keeps the chosen month's chip in sight when the row scrolls sideways.
  const monthRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = monthRow.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip) return;
    row.scrollLeft =
      chip.offsetLeft -
      row.offsetLeft -
      (row.clientWidth - chip.clientWidth) / 2;
  }, [view, accounts.length]);
  const showMonth = (next: YearMonth) => {
    setView(next);
    setHovered(null);
    setSelected(
      monthsApart(monthOf(today), next) === 0
        ? today
        : toIso(next.year, next.month, 1),
    );
  };

  const toggleCancel = (rule: Recurring) => {
    if (!rule.target) return;
    const cancelling = !cancelPlans.has(rule.id);
    const target = rule.target;
    startSaving(async () => {
      planCancel({ id: rule.id, cancelling });
      await setSubscriptionIntentAction(workspaceId, {
        ...target,
        intent: cancelling ? "cancel" : "keep",
      });
    });
  };

  if (accounts.length === 0) {
    return (
      <div className="page">
        <main>
          <EmptyMonth workspaceId={workspaceId} />
        </main>
      </div>
    );
  }

  const { payday } = summary;
  const dueCount = summary.dueBeforePayday.length;

  return (
    <MotionConfig reducedMotion="user">
      <div className="page">
        {/* The wordmark and navigation are in the shared header: src/app/(app)/layout.tsx. */}
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
            {!payday && (
              <p className="hero-why">
                Confirm your payday on{" "}
                <Link href={`/w/${workspaceId}/subscriptions`}>
                  Recurring payments
                </Link>{" "}
                to see what you can spend each day until then.
              </p>
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
                  onClick={() => showMonth(monthOf(today))}
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

            <div className="toolbar">
              <div
                ref={monthRow}
                className="chips month-chips"
                role="group"
                aria-label="Month"
              >
                {months.map((option) => {
                  const isNow = monthsApart(monthOf(today), option) === 0;
                  return (
                    <button
                      key={monthPrefix(option)}
                      type="button"
                      aria-pressed={monthsApart(view, option) === 0}
                      aria-label={`${monthTitle(option)}${isNow ? ", now" : ""}`}
                      onClick={() => showMonth(option)}
                    >
                      {monthChipLabel(option, monthOf(today))}
                      {isNow && (
                        <span className="chip-now" aria-hidden="true">
                          now
                        </span>
                      )}
                    </button>
                  );
                })}
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
                key={day.date}
                workspaceId={workspaceId}
                day={day}
                accounts={accounts}
                categories={categories}
                canEdit={canEdit}
                cancelPlans={cancelPlans}
              />
            </div>
          </section>

          <div className="lower">
            <section aria-labelledby="noticed-heading">
              <h2 id="noticed-heading">
                What we noticed in {monthName(monthOf(today))}
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
                    {summary.biggestCategory.name === UNCATEGORIZED ? (
                      "Most of your day-to-day spending isn’t in a category yet"
                    ) : (
                      <>
                        Most of your day-to-day spending went on{" "}
                        <strong>
                          {summary.biggestCategory.name.toLowerCase()}
                        </strong>
                      </>
                    )}
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
              {suggestions > 0 && (
                <p className="lede">
                  <Link
                    href={`/w/${workspaceId}/subscriptions?state=candidate`}
                  >
                    {suggestions === 1
                      ? "1 recurring payment to review"
                      : `${suggestions} recurring payments to review`}
                  </Link>
                  . Once you confirm them they show on the calendar.
                </p>
              )}
              {subscriptions.count === 0 ? (
                <p className="lede">
                  No confirmed subscriptions yet. They come from{" "}
                  <Link href={`/w/${workspaceId}/subscriptions`}>
                    Recurring payments
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <p className="lede">
                    Your {subscriptions.count} subscriptions cost{" "}
                    <strong>{formatCents(subscriptions.monthly)}</strong> a
                    month. Over a year that&rsquo;s{" "}
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
                                {formatCents(absolute(rule.amount))},{" "}
                                {cadenceLabel(
                                  rule.unit,
                                  rule.every,
                                ).toLowerCase()}{" "}
                                · next {formatShort(rule.nextOn)},{" "}
                                {formatCents(rule.yearly)} a year
                                {rule.onCard ? ", on card" : ""}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="plan"
                              aria-pressed={cancelling}
                              disabled={!canEdit}
                              onClick={() => toggleCancel(rule)}
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
                        Cancelling the {subscriptions.markedCount} you marked
                        would keep{" "}
                        <strong>
                          <Figure>
                            {formatCents(subscriptions.yearlySavingIfCancelled)}
                          </Figure>
                        </strong>{" "}
                        a year in your pocket. Marking only records your plan;
                        you cancel with the provider yourself.
                      </>
                    ) : (
                      <>
                        Not sure about one? Mark it to see what a year without
                        it would save.
                      </>
                    )}
                  </p>
                </>
              )}
            </section>

            <section aria-labelledby="sources-heading">
              <h2 id="sources-heading">Three ways your money gets here</h2>
              <ul className="sources">
                <li>
                  <span className="item-name">From your bank</span>
                  <span className="item-note">
                    Imported statements. {sources.bank} this month.{" "}
                    <Link href={`/w/${workspaceId}/import`}>
                      Import a statement
                    </Link>
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
                    {textingNote(linkState)} {sources.text} this month.{" "}
                    <Link href={`/w/${workspaceId}/settings`}>Settings</Link>
                  </span>
                </li>
              </ul>
            </section>
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
