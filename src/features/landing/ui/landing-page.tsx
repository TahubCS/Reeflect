import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { APP_NAME } from "@/config/app";
import { formatCents, formatSigned } from "@/lib/money";
import { SAMPLE, SCANNED, perDay, yoursToSpend } from "../domain/demo";
import { DemoClock } from "./demo-clock";
import { ChartCurtain, ChatDemo, PipelineStage, TodayCard } from "./demos";
import styles from "./landing.module.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-landing" });
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-landing-mono",
});

function Logo({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={styles.logo}
    >
      <rect x="1" y="1" width="26" height="26" rx="8" strokeWidth="1.6" />
      <path
        d="M7 11.5c2.3-2 4.7-2 7 0s4.7 2 7 0"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 17c2.3 2 4.7 2 7 0s4.7-2 7 0"
        strokeOpacity="0.45"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PreviewTag({ onDark = false }: { onDark?: boolean }) {
  return <span className={onDark ? styles.tagDark : styles.tag}>Preview</span>;
}

/** Days shown in the pipeline's calendar: the 7th is today, the 15th payday. */
const CALENDAR_DAYS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const BILL_DAYS = new Set([9, 12, 13, 14]);
const TODAY_DAY = 7;
const PAYDAY_DAY = 15;

function HeroMockup() {
  return (
    <div className={styles.mockup}>
      <div className={styles.mockupHead}>
        <p className={styles.mockupHeadline}>
          You can spend about {formatCents(perDay)} a day until payday.
        </p>
        <p className={styles.mistSoft}>
          Payday is {SAMPLE.paydayLong}, {SAMPLE.daysToPayday} days away.{" "}
          {SAMPLE.billsBeforePayday} payments come out before then.
        </p>
      </div>

      <dl className={styles.sums}>
        <div>
          <dt>In your account today</dt>
          <dd>{formatCents(SAMPLE.balanceToday)}</dd>
        </div>
        <span aria-hidden="true" className={styles.sumsOp}>
          −
        </span>
        <div>
          <dt>Owed before payday</dt>
          <dd>{formatCents(SAMPLE.owedBeforePayday)}</dd>
        </div>
        <span aria-hidden="true" className={styles.sumsOp}>
          =
        </span>
        <div>
          <dt>Yours to spend</dt>
          <dd>{formatCents(yoursToSpend)}</dd>
        </div>
      </dl>

      <div className={styles.chartBlock}>
        <div className={styles.chartHead}>
          <span className={styles.chartMonth}>{SAMPLE.month}</span>
          {/* A picture of the dashboard's month switch; it does nothing here. */}
          <span aria-hidden="true" className={styles.monthSwitch}>
            <span>‹ Earlier</span>
            <span>This month</span>
            <span data-current="true">Later ›</span>
          </span>
        </div>
        <div className={styles.chart}>
          <svg
            viewBox="0 0 520 170"
            width="100%"
            role="img"
            aria-label={`Projected balance for October: ${formatCents(SAMPLE.balanceToday)} today, rising on payday ${SAMPLE.payday}`}
          >
            <path
              className={styles.chartArea}
              d="M8 118 L40 121 L80 122 L110 124 L150 124 L190 127 L215 127 L240 94 L390 94 L420 96 L475 96 L492 72 L512 72 L512 170 L8 170 Z"
            />
            <path
              className={styles.chartPast}
              d="M8 118 L40 121 L80 122 L110 124"
            />
            <path
              className={styles.chartAhead}
              d="M110 124 L150 124 L190 127 L215 127 L240 94 L390 94 L420 96 L475 96 L492 72 L512 72"
            />
            <line
              className={styles.chartToday}
              x1="110"
              y1="24"
              x2="110"
              y2="170"
            />
            <text
              className={styles.chartTodayText}
              x="110"
              y="15"
              textAnchor="middle"
            >
              Today
            </text>
            <circle className={styles.chartDot} cx="110" cy="124" r="5" />
            <rect
              className={styles.chartLabel}
              x="117"
              y="92"
              width="102"
              height="24"
              rx="5"
            />
            <text
              className={styles.chartLabelText}
              x="168"
              y="108"
              textAnchor="middle"
            >
              Oct 7: {formatCents(SAMPLE.balanceToday)}
            </text>
          </svg>
          <ChartCurtain />
        </div>
      </div>
    </div>
  );
}

function ImportMockup() {
  return (
    <div className={styles.importCard}>
      <div className={styles.upload}>
        <span aria-hidden="true" className={styles.fileIcon}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M6 6h8M6 10h8M6 14h5"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div className={styles.uploadText}>
          <div className={styles.uploadRow}>
            <span className={styles.uploadName}>september-statement.pdf</span>
            <span className={styles.uploadDone}>Done</span>
          </div>
          <div aria-hidden="true" className={styles.progress}>
            <span />
          </div>
        </div>
      </div>
      <div className={styles.importSummary}>
        <span className={styles.strong}>42 transactions found</span>
        <span className={styles.inkMuted}>Auto-categorized</span>
      </div>
      <table className={styles.scanned}>
        <caption className="sr-only">
          Transactions found in the statement
        </caption>
        <colgroup>
          <col className={styles.colDate} />
          <col />
          <col className={styles.colCategory} />
          <col className={styles.colAmount} />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Description</th>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {SCANNED.map((row) => (
            <tr key={row.name}>
              <td className={styles.mono}>{row.date}</td>
              <td className={styles.scannedName}>{row.name}</td>
              <td>
                <span className={styles.category}>{row.category}</span>
              </td>
              <td className={styles.scannedAmount}>
                {formatSigned(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PipelineLink({ delay }: { delay: number }) {
  return (
    <li aria-hidden="true" className={styles.pipeLink}>
      <span className={styles.pipeDash} />
      <span
        className={styles.pipeFlow}
        style={{ animationDelay: `${delay}s` }}
      />
    </li>
  );
}

function Pipeline() {
  return (
    <ol className={styles.pipeline}>
      <PipelineStage index={0}>
        <svg {...stageIcon}>
          <path d="M3 10l9-6 9 6" />
          <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
          <path d="M3 20h18" />
        </svg>
        <span className={styles.stageNumber}>01 · Source</span>
        <h3>Capital One Nessie API</h3>
        <p>
          {APP_NAME} requests the account&apos;s purchases, deposits and bills.
        </p>
        <div className={styles.stageFoot}>
          <code>GET /accounts/{"{id}"}/purchases</code>
          <code>GET /accounts/{"{id}"}/deposits</code>
          <code>GET /accounts/{"{id}"}/bills</code>
        </div>
      </PipelineStage>
      <PipelineLink delay={0} />
      <PipelineStage index={1}>
        <svg {...stageIcon}>
          <path d="M20 12a8 8 0 0 1-14.3 4.9" />
          <path d="M4 12a8 8 0 0 1 14.3-4.9" />
          <path d="M18.5 3v4.2h-4.2" />
          <path d="M5.5 21v-4.2h4.2" />
        </svg>
        <span className={styles.stageNumber}>02 · Sync</span>
        <h3>{APP_NAME} backend</h3>
        <p>
          Merges bank data with your imported statements and texted-in entries,
          removes duplicates, and sorts each one into a category.
        </p>
        <div className={styles.stageChips}>
          <span>+ Imported statements</span>
          <span>+ Texted in</span>
        </div>
      </PipelineStage>
      <PipelineLink delay={0.53} />
      <PipelineStage index={2}>
        <svg {...stageIcon}>
          <path d="M3 17l5-5 4 3 4-6 5 4" />
          <path d="M3 21h18" />
        </svg>
        <span className={styles.stageNumber}>03 · Forecast</span>
        <h3>Balance forecast</h3>
        <p>
          Rolls upcoming bills and your next payday forward to project your
          balance for every day of the month.
        </p>
        <div className={styles.stageChips}>
          <span>Payday {SAMPLE.paydayShort}</span>
          <span>{SAMPLE.billsBeforePayday} bills due first</span>
        </div>
      </PipelineStage>
      <PipelineLink delay={1.06} />
      <PipelineStage index={3}>
        <svg {...stageIcon}>
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className={styles.stageNumber}>04 · Show</span>
        <h3>Calendar dashboard</h3>
        <div
          role="img"
          aria-label="Calendar for October 4 to 17: today is the 7th, bills on the 9th, 12th, 13th and 14th, payday on the 15th"
          className={styles.miniCalendar}
        >
          {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
            <span key={i} className={styles.weekday}>
              {day}
            </span>
          ))}
          {CALENDAR_DAYS.map((day) => (
            <span
              key={day}
              data-today={day === TODAY_DAY || undefined}
              data-bill={BILL_DAYS.has(day) || undefined}
              data-payday={day === PAYDAY_DAY || undefined}
            >
              {day}
              {(BILL_DAYS.has(day) || day === PAYDAY_DAY) && <i />}
            </span>
          ))}
        </div>
        <div className={styles.safe}>
          <span>Safe to spend</span>
          <span className={styles.safeAmount}>{formatCents(perDay)}/day</span>
        </div>
      </PipelineStage>
    </ol>
  );
}

const stageIcon = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: styles.stageIcon,
} as const;

export function LandingPage() {
  return (
    <div className={`${sans.variable} ${mono.variable} ${styles.page}`}>
      <DemoClock>
        <header className={styles.hero}>
          <div aria-hidden="true" className={styles.heroGrid} />
          <nav aria-label="Main" className={styles.nav}>
            <a href="#top" className={styles.brand}>
              <Logo size={28} />
              <span>{APP_NAME}</span>
            </a>
            <div className={styles.navLinks}>
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <Link href="/sign-in">Sign in</Link>
              <Link href="/sign-up" className={styles.buttonSmall}>
                Sign up free
              </Link>
            </div>
          </nav>

          <div id="top" className={styles.heroBody}>
            <div className={styles.heroCopy}>
              <p className={styles.pill}>
                <span aria-hidden="true" />
                Personal finance, by text
              </p>
              <h1 className={styles.headline}>
                {APP_NAME} lives in your texts.
              </h1>
              <p className={styles.heroLede}>
                Ask how you&apos;re doing and it tells you what you can spend
                each day until payday, and what&apos;s coming before then. On
                the web, your whole month is a calendar.
              </p>
              <div className={styles.heroActions}>
                <Link href="/sign-up" className={styles.button}>
                  Sign up free
                  <ArrowRight />
                </Link>
                <a href="#how" className={styles.heroSecondary}>
                  See how it works
                </a>
              </div>
            </div>
            <div className={styles.heroMockup}>
              <HeroMockup />
            </div>
          </div>
        </header>

        <main>
          <section id="features" className={styles.features}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>What {APP_NAME} does</span>
              <h2 className={styles.sectionTitle}>
                Less bookkeeping. More knowing where you stand.
              </h2>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureText}>
                <span className={styles.featureNumber}>01 · Track</span>
                <h3>Every dollar, sorted.</h3>
                <p>
                  Income and expenses land in one place and sort themselves into
                  categories. See your month at a glance, spot what changed, and
                  stop guessing what&apos;s left until payday.
                </p>
              </div>
              <div className={styles.featureDemo}>
                <TodayCard />
              </div>
            </div>

            <div className={`${styles.feature} ${styles.featureFlipped}`}>
              <div className={styles.featureDemo}>
                <ImportMockup />
              </div>
              <div className={styles.featureText}>
                <div className={styles.featureLabel}>
                  <span className={styles.featureNumber}>02 · Import</span>
                  <PreviewTag />
                </div>
                <h3>Drop in a statement. Skip the data entry.</h3>
                <p>
                  Upload a bank statement as a PDF or CSV and {APP_NAME} pulls
                  out every transaction, dates and amounts included, then files
                  each one where it belongs. Months of history in seconds, not
                  an afternoon of typing.
                </p>
              </div>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureText}>
                <span className={styles.featureNumber}>03 · Ask</span>
                <h3>Just text it.</h3>
                <p>
                  Text &quot;spent 12 on lunch&quot; and it&apos;s logged. Ask
                  &quot;how am I doing?&quot; or how much you spent on food, and{" "}
                  {APP_NAME} answers with your exact numbers. No app to open.
                </p>
              </div>
              <div className={styles.featureDemo}>
                <ChatDemo />
              </div>
            </div>
          </section>

          <section
            id="pipeline"
            aria-labelledby="pipeline-title"
            className={styles.pipelineBand}
          >
            <div className={styles.pipelineInner}>
              <div className={styles.sectionHead}>
                <div className={styles.featureLabel}>
                  <span className={styles.eyebrowDark}>Under the hood</span>
                  <PreviewTag onDark />
                </div>
                <h2 id="pipeline-title" className={styles.sectionTitle}>
                  From your bank to your calendar.
                </h2>
                <p className={styles.pipelineLede}>
                  Every number on your dashboard traces back to a transaction.
                  Here&apos;s the path it takes. The Nessie sync is still being
                  built; until then, the dashboard runs on sample data.
                </p>
              </div>
              <Pipeline />
            </div>
          </section>

          <section id="how" aria-labelledby="how-title" className={styles.how}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>How it works</span>
              <h2 id="how-title" className={styles.sectionTitle}>
                Up and running in three steps.
              </h2>
            </div>
            <ol className={styles.steps}>
              <li>
                <span className={styles.stepNumber}>01</span>
                <h3>Create your free account</h3>
                <p>Sign up with your email. No card required.</p>
              </li>
              <li>
                <div className={styles.featureLabel}>
                  <span className={styles.stepNumber}>02</span>
                  <PreviewTag />
                </div>
                <h3>Upload a statement</h3>
                <p>
                  Add your latest bank statement, or log income and expenses by
                  hand.
                </p>
              </li>
              <li>
                <span className={styles.stepNumber}>03</span>
                <h3>See it, then ask</h3>
                <p>
                  Your dashboard fills in instantly. Ask the agent whatever you
                  want to know.
                </p>
              </li>
            </ol>
          </section>

          <section
            id="signup"
            aria-labelledby="signup-title"
            className={styles.ctaBand}
          >
            <div className={styles.cta}>
              <svg
                aria-hidden="true"
                className={styles.ctaWaves}
                width="420"
                height="200"
                viewBox="0 0 420 200"
                fill="none"
              >
                <path
                  d="M0 70c35-30 70-30 105 0s70 30 105 0 70-30 105 0 70 30 105 0"
                  strokeWidth="3"
                />
                <path
                  d="M0 130c35 30 70 30 105 0s70-30 105 0 70 30 105 0 70-30 105 0"
                  strokeWidth="3"
                  strokeOpacity="0.5"
                />
              </svg>
              <div className={styles.ctaText}>
                <h2 id="signup-title" className={styles.ctaTitle}>
                  Start reflecting on your money.
                </h2>
                <p>Free to start. Takes about a minute.</p>
              </div>
              {/* Sign-up fills its Email field from ?email= (prefillEmail). */}
              <form action="/sign-up" method="get" className={styles.ctaForm}>
                <label htmlFor="landing-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="landing-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                />
                <button type="submit" className={styles.button}>
                  Sign up free
                </button>
              </form>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <Logo size={22} />
              <span>{APP_NAME}</span>
            </div>
            <nav aria-label="Footer" className={styles.footerLinks}>
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <Link href="/sign-up">Sign up</Link>
            </nav>
            <span>© 2026 {APP_NAME}</span>
          </div>
        </footer>
      </DemoClock>
    </div>
  );
}
