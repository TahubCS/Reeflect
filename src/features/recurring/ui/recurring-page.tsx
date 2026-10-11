import Link from "next/link";
import { cents, formatCents, formatSigned } from "@/lib/money";
import type { FormAction } from "../domain/forms";
import type { Payment, summarizePayments } from "../domain/payments";
import { ActionForm, PaymentForm } from "./forms";
import styles from "./recurring.module.css";

type PaymentActions = {
  confirm: FormAction;
  intent: FormAction;
  disposition: FormAction;
  update: FormAction;
};
type Card = Payment & { accountName: string; actions: PaymentActions };
type Props = {
  cards: Card[];
  accounts: { id: string; name: string }[];
  accountsHref: string;
  today: string;
  canEdit: boolean;
  summary: ReturnType<typeof summarizePayments>;
  createAction: FormAction;
  refreshAction: FormAction;
  query: {
    kind: string;
    state: string;
    intent: string;
    account?: string;
    page: number;
  };
  total: number;
  pageSize: number;
};
const INTENT_LABEL = {
  none: "No choice saved",
  keep: "Keep",
  cancel: "Planning to cancel",
};

function PaymentCard({
  payment,
  canEdit,
  accounts,
  today,
}: {
  payment: Card;
  canEdit: boolean;
  accounts: Props["accounts"];
  today: string;
}) {
  return (
    <article className={styles.card} aria-label={payment.name}>
      <div className={styles.cardHead}>
        <h2>{payment.name}</h2>
        <span className={styles.badge}>
          {payment.decision === "candidate"
            ? "Suggested pattern"
            : payment.decision === "dismissed"
              ? "Dismissed"
              : "Tracking"}
        </span>
      </div>
      <p>
        {payment.accountName} ·{" "}
        {payment.kind === "bill" ? "Bill" : "Subscription"} · {payment.cadence}{" "}
        · {payment.amountMode === "fixed" ? "Fixed amount" : "Variable amount"}
      </p>
      <p className={styles.amount}>
        {formatCents(payment.amount)}{" "}
        <span>
          per payment {payment.amountMode === "variable" ? "(estimate)" : ""}
        </span>
      </p>
      <dl className={styles.metrics}>
        <div>
          <dt>Monthly equivalent estimate</dt>
          <dd>{formatCents(payment.monthly)}</dd>
        </div>
        <div>
          <dt>Annual estimate</dt>
          <dd>{formatCents(payment.yearly)}</dd>
        </div>
        <div>
          <dt>Actual net charges this month</dt>
          <dd>{formatCents(payment.actual)}</dd>
        </div>
        <div>
          <dt>
            {payment.dateSource === "user"
              ? "Next date entered by you"
              : "Expected next charge"}
          </dt>
          <dd>{payment.nextOn ?? "Unknown — add a date to resume tracking"}</dd>
        </div>
      </dl>
      {payment.sampleCount ? (
        <p className={styles.note}>
          Recent range {formatCents(payment.low)}–{formatCents(payment.high)}{" "}
          from {payment.sampleCount}{" "}
          {payment.sampleCount === 1 ? "charge" : "charges"}.{" "}
          {payment.amountMode === "variable"
            ? "The typical estimate uses the recent median unless you set an amount."
            : ""}
        </p>
      ) : (
        <p className={styles.note}>
          Your entered estimate; no matching posted charges yet.
        </p>
      )}
      {payment.priceChanged ? (
        <p className={styles.change}>
          Latest charge differs from the saved fixed amount of{" "}
          {formatCents(payment.previousAmount)}. Review the charges below.
        </p>
      ) : null}
      {!payment.active && payment.decision === "confirmed" ? (
        <p>No recent timing pattern. Excluded from recurring cost estimates.</p>
      ) : null}
      {payment.decision === "candidate" ? (
        <p>
          Found repeated dates across {payment.charges.length} matching charges.
          Check the evidence before confirming. This suggestion is excluded from
          estimated totals.
        </p>
      ) : null}
      {payment.kind === "subscription" && payment.decision === "confirmed" ? (
        <p>
          Choice: {INTENT_LABEL[payment.userIntent]}.{" "}
          {payment.userIntent === "cancel"
            ? "Current costs remain included until the payments stop."
            : ""}
        </p>
      ) : null}
      {payment.charges.length ? (
        <details>
          <summary>Recent matching charges ({payment.charges.length})</summary>
          <ul className={styles.charges}>
            {payment.charges.map((charge) => (
              <li key={charge.id}>
                <span>
                  {charge.postedOn} · {charge.source}
                </span>
                <span>{formatSigned(cents(charge.amountCents))}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {canEdit ? (
        <div className={styles.controls}>
          {payment.decision === "candidate" ? (
            <ActionForm action={payment.actions.confirm}>
              <button type="submit">Confirm recurring payment</button>
            </ActionForm>
          ) : null}
          {payment.kind === "subscription" &&
          payment.decision === "confirmed" ? (
            <ActionForm action={payment.actions.intent}>
              <button name="intent" value="keep">
                Keep
              </button>
              <button name="intent" value="cancel">
                Planning to cancel
              </button>
              <button name="intent" value="none">
                Clear choice
              </button>
            </ActionForm>
          ) : null}
          {payment.decision === "dismissed" ? (
            <ActionForm action={payment.actions.disposition}>
              <button name="disposition" value="restore">
                Restore tracking
              </button>
            </ActionForm>
          ) : (
            <ActionForm action={payment.actions.disposition}>
              <button name="disposition" value="dismiss">
                Not recurring
              </button>
            </ActionForm>
          )}
          {payment.decision === "confirmed" ? (
            <>
              <details>
                <summary>Edit payment</summary>
                <PaymentForm
                  action={payment.actions.update}
                  initial={payment}
                  accounts={accounts}
                  today={today}
                />
              </details>
              {payment.manual ? (
                <details>
                  <summary>Remove tracking</summary>
                  <p>
                    This removes the payment from tracking. Your transactions
                    remain available.
                  </p>
                  <ActionForm action={payment.actions.disposition}>
                    <button name="disposition" value="remove">
                      Confirm remove tracking
                    </button>
                  </ActionForm>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function RecurringPage({
  cards,
  accounts,
  accountsHref,
  today,
  canEdit,
  summary,
  createAction,
  refreshAction,
  query,
  total,
  pageSize,
}: Props) {
  const pageHref = (page: number) =>
    `?${new URLSearchParams({ kind: query.kind, state: query.state, intent: query.intent, ...(query.account ? { account: query.account } : {}), page: String(page) })}`;
  return (
    <main className={`page ${styles.page}`}>
      <div className={styles.heading}>
        <div>
          <h1>Recurring payments</h1>
          <p>Bills and subscriptions, understood from your payment patterns.</p>
        </div>
        {canEdit ? (
          <ActionForm action={refreshAction}>
            <button type="submit">Refresh patterns</button>
          </ActionForm>
        ) : (
          <p>Read-only access</p>
        )}
      </div>
      <section
        aria-label="Workspace recurring totals"
        className={styles.summary}
      >
        <div>
          <h2>Estimated recurring cost</h2>
          <p className={styles.amount}>
            {formatCents(summary.monthly)} <span>per month</span>
          </p>
          <p>{formatCents(summary.yearly)} annual estimate</p>
        </div>
        <div>
          <h2>Monthly breakdown</h2>
          <p>Bills {formatCents(summary.bills)}</p>
          <p>Subscriptions {formatCents(summary.subscriptions)}</p>
        </div>
        <div>
          <h2>Actual recurring spending this month</h2>
          <p className={styles.amount}>{formatCents(summary.actual)}</p>
          <p>Posted charges minus matching credits on confirmed payments</p>
        </div>
        <div>
          <h2>Potential annual savings</h2>
          <p className={styles.amount}>{formatCents(summary.saving)}</p>
          <p>If the subscriptions marked planning to cancel stop</p>
        </div>
      </section>
      <p className={styles.note}>
        Workspace totals cover {summary.count} tracked{" "}
        {summary.count === 1 ? "payment" : "payments"}. Future costs and dates
        are estimates, not money already spent. {summary.candidates}{" "}
        {summary.candidates === 1 ? "suggestion needs" : "suggestions need"}{" "}
        confirmation.
      </p>
      {canEdit ? (
        <details className={styles.add}>
          <summary>Add a recurring payment</summary>
          {accounts.length ? (
            <PaymentForm
              action={createAction}
              accounts={accounts}
              today={today}
            />
          ) : (
            <p>
              <Link href={accountsHref}>Add an account</Link> before tracking a
              payment.
            </p>
          )}
        </details>
      ) : null}
      <form
        method="get"
        className={styles.filters}
        aria-label="Filter recurring payments"
      >
        <label>
          Payment kind
          <select name="kind" defaultValue={query.kind}>
            <option value="all">All payments</option>
            <option value="bill">Bills</option>
            <option value="subscription">Subscriptions</option>
          </select>
        </label>
        <label>
          Tracking state
          <select name="state" defaultValue={query.state}>
            <option value="all">Tracking and suggestions</option>
            <option value="confirmed">Tracking</option>
            <option value="candidate">Suggestions</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
        <label>
          Account
          <select name="account" defaultValue={query.account ?? ""}>
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subscription choice
          <select name="intent" defaultValue={query.intent}>
            <option value="all">All choices</option>
            <option value="none">No choice</option>
            <option value="keep">Keep</option>
            <option value="cancel">Planning to cancel</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>
      <section className={styles.list} aria-label="Recurring payment list">
        {cards.length ? (
          cards.map((payment) => (
            <PaymentCard
              key={payment.key}
              payment={payment}
              canEdit={canEdit}
              accounts={accounts}
              today={today}
            />
          ))
        ) : (
          <p>
            No recurring payments in this view. Patterns appear after enough
            regularly timed charges. You can also add a payment manually.
          </p>
        )}
      </section>
      <nav className={styles.pagination} aria-label="Recurring payment pages">
        <span>
          Page {query.page} · {total} payments
        </span>
        {query.page > 1 ? (
          <Link href={pageHref(query.page - 1)}>Previous page</Link>
        ) : null}
        {query.page * pageSize < total ? (
          <Link href={pageHref(query.page + 1)}>Next page</Link>
        ) : null}
      </nav>
    </main>
  );
}
