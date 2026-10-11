// The Insights page (F-35, ADR-056). Server components only: the controls
// are links, so the page works without JavaScript and every state is in the
// URL. Every group figure is labelled "Sample" (ADR-024); the words say
// where you stand, and the tints only echo them (ADR-042).
import Link from "next/link";
import { type Cents, cents, formatCents, ratio } from "@/lib/money";
import {
  type CategoryRow,
  type CompareWith,
  type Comparison,
  PLACEMENT_TEXT,
  type Spread,
  type Tone,
  type Unit,
  differenceText,
} from "../domain/cohort";
import {
  PERIOD_DAYS,
  PERIOD_LABELS,
  type IsoDate,
  type PeriodDays,
} from "../domain/periods";
import type { InsightsQuery, InsightsView, ShowAs } from "../server/insights";
import styles from "./insights.module.css";

const PERSONA_LABELS: Record<string, string> = {
  paycheck_to_paycheck: "Paycheck to paycheck",
  hourly_gig: "Hourly and gig",
  student: "Student",
  salaried_middle: "Salaried",
  upper_middle_tech: "Upper-middle tech",
  retiree: "Retiree",
  single_parent: "Single parent",
};
const PERSONA_ORDER = Object.keys(PERSONA_LABELS);

const COMPARE_LABELS: Record<CompareWith, string> = {
  like_you: "People like you",
  everyone: "Everyone",
};

const SHOW_LABELS: Record<ShowAs, string> = {
  dollars: "Dollars a month",
  share: "Share of take-home",
};

const TONE_CLASS: Record<Tone, string | undefined> = {
  good: styles.good,
  fair: styles.fair,
  neutral: undefined,
  watch: styles.watch,
  care: styles.care,
};

const dollars = (value: number) =>
  formatCents(cents(Math.round(value)), { whole: true });
const percent = (share: number) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(share * 100)}%`;
const count = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
const format = (unit: Unit, value: number) =>
  unit === "money"
    ? dollars(value)
    : unit === "share"
      ? percent(value)
      : count(value);

function formatDay(date: IsoDate): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function href(
  base: string,
  query: InsightsQuery,
  change: Partial<InsightsQuery>,
) {
  const next = { ...query, ...change };
  return `${base}?period=${next.period}&compare=${next.compare}&show=${next.show}`;
}

function Choice<T extends string | number>({
  label,
  options,
  current,
  link,
  quiet = false,
}: {
  label: string;
  options: readonly { value: T; text: string }[];
  current: T;
  link: (value: T) => string;
  quiet?: boolean;
}) {
  return (
    <nav aria-label={label} className={quiet ? styles.quiet : styles.segmented}>
      {quiet && <span className={styles.quietLabel}>{label}:</span>}
      {options.map((option) => (
        <Link
          key={option.value}
          href={link(option.value)}
          aria-current={option.value === current ? "true" : undefined}
          scroll={false}
        >
          {option.text}
        </Link>
      ))}
    </nav>
  );
}

export function InsightsPage({
  workspaceId,
  view,
}: {
  workspaceId: string;
  view: InsightsView;
}) {
  const base = `/w/${workspaceId}/insights`;
  const { query, period, you, sample } = view;
  const link = (change: Partial<InsightsQuery>) => href(base, query, change);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1>Insights</h1>
          <span className={styles.badge}>Sample</span>
        </div>
        <p className={styles.lede}>
          Your money next to a sample population with similar take-home pay.
          Their figures are sample data, not real customers.
        </p>
      </header>

      <div className={styles.controls}>
        <Choice<PeriodDays>
          label="Period"
          options={PERIOD_DAYS.map((days) => ({
            value: days,
            text: PERIOD_LABELS[days],
          }))}
          current={query.period}
          link={(period) => link({ period })}
        />
        <Choice<CompareWith>
          label="Compare with"
          options={(["like_you", "everyone"] as const).map((value) => ({
            value,
            text: COMPARE_LABELS[value],
          }))}
          current={query.compare}
          link={(compare) => link({ compare })}
        />
      </div>

      <Context view={view} />

      {sample && you && (
        <>
          <Categories
            rows={sample.categories}
            show={query.show}
            link={(show) => link({ show })}
            uncategorized={you.uncategorized}
            spending={cents(you.measures.spending ?? 0)}
            transactionsHref={`/w/${workspaceId}/transactions`}
          />
          <Standing comparisons={sample.comparisons} />
          <p className={styles.notes}>
            Your figures are worked out when the page loads, from this workspace
            only, for {formatDay(period.from)} to {formatDay(period.to)}. Group
            figures were computed when the sample was loaded, for the same
            number of days up to {formatDay(sample.asOf)}. Amounts are per
            average month. Transfers between your own accounts are never
            spending.
          </p>
        </>
      )}
    </main>
  );
}

function Context({ view }: { view: InsightsView }) {
  const { you, sample, period } = view;
  const group = sample?.group;
  return (
    <section className={styles.context} aria-label="Who you are compared with">
      <div className={styles.figure}>
        <span className={styles.figureLabel}>Your take-home</span>
        <span className={styles.figureValue}>
          {you ? dollars(you.measures.take_home ?? 0) : "—"}
          <span className={styles.per}> a month</span>
        </span>
        <span className={styles.figureNote}>
          {formatDay(period.from)} to {formatDay(period.to)}
        </span>
      </div>
      {group && (
        <div className={styles.figure}>
          <span className={styles.figureLabel}>
            Compared with {group.size} sample people
          </span>
          <span className={styles.figureValue}>
            {dollars(group.takeHomeLow)} to {dollars(group.takeHomeHigh)}
            <span className={styles.per}> a month</span>
          </span>
          <span className={styles.figureNote}>
            {view.query.compare === "like_you" && !sample.everyoneInstead
              ? "Their take-home: the 10 just below yours and the 10 just above"
              : "Their take-home: everyone in the sample"}
          </span>
        </div>
      )}

      {group && group.size > 0 && (
        <div className={styles.mix}>
          <div className={styles.mixBar} aria-hidden="true">
            {group.personas.map((p) => (
              <i
                key={p.persona}
                style={{
                  width: `${(100 * p.people) / group.size}%`,
                  background: personaColor(p.persona),
                }}
              />
            ))}
          </div>
          <p className={styles.mixLegend}>
            {group.personas.map((p) => (
              <span key={p.persona}>
                <b style={{ background: personaColor(p.persona) }} />
                {PERSONA_LABELS[p.persona] ?? p.persona} {p.people}
              </span>
            ))}
          </p>
        </div>
      )}

      {!you && (
        <p className={styles.callout}>
          No transactions in this period yet. Add an account or import a
          statement, and your figures appear here.
        </p>
      )}
      {you && you.coveredDays < period.days && (
        <p className={styles.callout}>
          Your transactions start partway through this period, so your figures
          cover the last {you.coveredDays} days, averaged per month.
        </p>
      )}
      {sample?.everyoneInstead && (
        <p className={styles.callout}>
          No take-home pay in this period yet, so this compares you with
          everyone in the sample.
        </p>
      )}
      {!sample && (
        <p className={styles.callout}>
          No sample population is loaded in this database yet, so there is
          nothing to compare with. A developer can load one with{" "}
          <code>pnpm batch load</code>.
        </p>
      )}
      {sample && <p className={styles.source}>Sample: {sample.label}</p>}
    </section>
  );
}

function personaColor(persona: string): string {
  const i = PERSONA_ORDER.indexOf(persona);
  return `var(--persona-${(i < 0 ? 3 : i) + 1})`;
}

function Categories({
  rows,
  show,
  link,
  uncategorized,
  spending,
  transactionsHref,
}: {
  rows: CategoryRow[];
  show: ShowAs;
  link: (show: ShowAs) => string;
  uncategorized: Cents;
  spending: Cents;
  transactionsHref: string;
}) {
  const share = show === "share";
  const value = (r: CategoryRow, who: "you" | "typical") =>
    share ? ((who === "you" ? r.youShare : r.typicalShare) ?? 0) : r[who];
  const max = Math.max(
    1e-9,
    ...rows.flatMap((r) => [value(r, "you"), value(r, "typical")]),
  );
  const fmt = (v: number) => (share ? percent(v) : dollars(v));
  return (
    <section className={styles.panel} aria-labelledby="categories-heading">
      <div className={styles.panelHead}>
        <h2 id="categories-heading">Spending by category</h2>
        <Choice<ShowAs>
          label="Show as"
          quiet
          options={(["dollars", "share"] as const).map((v) => ({
            value: v,
            text: SHOW_LABELS[v],
          }))}
          current={show}
          link={link}
        />
      </div>
      <p className={styles.panelLede}>
        What you spend in an average month next to the typical person in the
        group (their median).
      </p>
      {uncategorized > 0 && (
        <p className={styles.callout}>
          {dollars(uncategorized)} a month of your spending
          {spending > 0 && (
            <> ({percent(ratio(uncategorized, spending))} of it)</>
          )}{" "}
          is Uncategorized, so it can&apos;t be compared by category.{" "}
          <Link href={transactionsHref}>Add rules on Transactions</Link>.
        </p>
      )}
      <ul className={styles.key} aria-hidden="true">
        <li>
          <i className={styles.keyYou} /> You
        </li>
        <li>
          <i className={styles.keyTypical} /> Typical in this group
        </li>
      </ul>
      {rows.length === 0 ? (
        <p className={styles.empty}>No spending in this period.</p>
      ) : (
        <ul className={styles.cats}>
          {rows.map((r) => {
            const you = value(r, "you");
            const typical = value(r, "typical");
            return (
              <li key={r.key} className={styles.cat}>
                <div>
                  <div className={styles.catName}>{r.label}</div>
                  <div className={styles.catKind}>{r.kind}</div>
                </div>
                <div className={styles.bars} aria-hidden="true">
                  <div
                    className={styles.barYou}
                    style={{ width: `${(100 * you) / max}%` }}
                  />
                  <div
                    className={styles.barTypical}
                    style={{ width: `${(100 * typical) / max}%` }}
                  />
                </div>
                <div className={`${styles.diff} ${TONE_CLASS[r.tone] ?? ""}`}>
                  <strong>
                    You {fmt(you)} · Typical {fmt(typical)}
                  </strong>
                  {share && (r.youShare === null || r.typicalShare === null)
                    ? "No take-home to compare with"
                    : differenceText(
                        you,
                        typical,
                        share ? "share" : "money",
                        fmt,
                      )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Standing({ comparisons }: { comparisons: Comparison[] }) {
  return (
    <section className={styles.panel} aria-labelledby="standing-heading">
      <div className={styles.panelHead}>
        <h2 id="standing-heading">Where you stand</h2>
      </div>
      <p className={styles.panelLede}>
        Each line runs from the lowest to the highest in the group. The shaded
        part is the middle half, the line is the typical person, and the dot is
        you.
      </p>
      <ul className={styles.strips}>
        {comparisons.map((c) => (
          <Strip key={c.metric.id} comparison={c} />
        ))}
      </ul>
    </section>
  );
}

function Strip({ comparison: c }: { comparison: Comparison }) {
  const { unit } = c.metric;
  const s: Spread = c.spread;
  const lo = Math.min(s.lowest, c.you);
  const hi = Math.max(s.highest, c.you);
  const x = (v: number) => (hi === lo ? 50 : (100 * (v - lo)) / (hi - lo));
  const f = (v: number) => format(unit, v);
  const summary = `Typical ${f(s.median)}. Middle half ${f(s.lowerQuartile)} to ${f(s.upperQuartile)}.`;
  return (
    <li className={styles.strip}>
      <div>
        <div className={styles.stripName}>{c.metric.label}</div>
        <div className={styles.stripValue}>
          {f(c.you)} <span className={styles.per}>{c.metric.per}</span>
        </div>
      </div>
      <div
        className={styles.track}
        role="img"
        aria-label={`${c.metric.label}: you ${f(c.you)}. ${summary}`}
      >
        <div className={styles.rail} />
        <div
          className={styles.band}
          style={{
            left: `${x(s.lowerQuartile)}%`,
            width: `${x(s.upperQuartile) - x(s.lowerQuartile)}%`,
          }}
        />
        <div className={styles.median} style={{ left: `${x(s.median)}%` }} />
        <div className={styles.dot} style={{ left: `${x(c.you)}%` }} />
        <span className={styles.end} style={{ left: 0 }}>
          {f(lo)}
        </span>
        <span className={styles.end} style={{ right: 0 }}>
          {f(hi)}
        </span>
      </div>
      <p className={styles.say}>
        <span className={`${styles.place} ${TONE_CLASS[c.tone] ?? ""}`}>
          {PLACEMENT_TEXT[c.placement]}
        </span>{" "}
        {summary}
      </p>
    </li>
  );
}
