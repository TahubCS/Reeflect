import Link from "next/link";
import { Confirm } from "@/components/ui/confirm";
import { shiftDays } from "@/features/recurring/client";
import { cents, formatCents, toDecimalString } from "@/lib/money";
import { isSettled, type CycleStatus, type CycleView } from "../domain/cycles";
import { billHref } from "../domain/forms";
import type { BillsView } from "../server/load";
import type { BillRecord } from "../server/repository";
import {
  billDispositionAction,
  confirmBillAction,
  createBillAction,
  linkPaymentAction,
  markPaidAction,
  saveInvoiceAction,
  unlinkPaymentAction,
  updateBillAction,
} from "../server/actions";
import { BillForm, BillOperation, InvoiceForm, PaymentForm } from "./forms";
import styles from "./bills.module.css";

const labels: Record<CycleStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partially paid",
  paid: "Paid from posted activity",
  marked_paid: "Marked paid manually",
  no_payment_due: "No payment due",
  review: "Needs review",
};
const date = (on: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${on}T12:00:00Z`));
const due = (cycle: CycleView) =>
  `${cycle.dateSource === "user" ? "Due" : "Expected around"} ${date(cycle.dueOn)}`;
const tracked = (bill: BillRecord) =>
  bill.payment.decision === "confirmed" && bill.payment.kind === "bill";
function listHref(data: BillsView, page: number, view = data.query.view) {
  const query = new URLSearchParams({ view, page: String(page) });
  if (data.query.account) query.set("account", data.query.account);
  if (data.query.from) query.set("from", data.query.from);
  if (data.query.to) query.set("to", data.query.to);
  return `/w/${data.workspaceId}/bills?${query.toString()}`;
}
function Facts({ cycle }: { cycle: CycleView }) {
  return (
    <dl className={styles.facts}>
      <div>
        <dt>
          {cycle.invoiceCents === null ? "Typical estimate" : "Invoice amount"}
        </dt>
        <dd>{formatCents(cents(cycle.invoiceCents ?? cycle.estimateCents))}</dd>
      </div>
      <div>
        <dt>Linked posted payments</dt>
        <dd>{formatCents(cycle.paid)}</dd>
      </div>
      <div>
        <dt>
          {cycle.invoiceCents === null && !cycle.markedPaid
            ? "Estimated remaining"
            : "Remaining"}
        </dt>
        <dd>{formatCents(cycle.remaining)}</dd>
      </div>
    </dl>
  );
}
function BillDetail({ data }: { data: BillsView }) {
  const bill = data.selected;
  if (!bill) return null;
  const p = bill.payment;
  const cycle = data.cycle;
  const active = tracked(bill);
  const account = data.accounts.find((a) => a.id === p.accountId);
  const editable = data.canEdit && active;
  const args = [data.workspaceId, p.accountId, p.merchant] as const;
  const history = bill.cycles
    .filter((c) => c.id !== null)
    .sort((a, b) => b.scheduledOn.localeCompare(a.scheduledOn));
  const historyPages = Math.max(1, Math.ceil(history.length / 20));
  const historyPage = Math.min(data.query.historyPage, historyPages);
  const historyRows = history.slice((historyPage - 1) * 20, historyPage * 20);
  return (
    <section className={styles.panel} aria-label="Bill detail">
      <div className={styles.cardHead}>
        <div>
          <h2>{p.name}</h2>
          <p>
            {account?.nickname} · {p.cadence} ·{" "}
            {p.amountMode === "variable" ? "Variable amount" : "Fixed amount"}
          </p>
        </div>
        <Link href={`/w/${data.workspaceId}/bills`}>Back to all bills</Link>
      </div>
      <p className={styles.note}>
        Payee: {p.merchant}.{" "}
        {bill.detail?.autopay
          ? "Autopay is noted; confirm its setup with the provider."
          : "Autopay is not noted."}
      </p>
      {p.sampleCount ? (
        <p className={styles.note}>
          Pattern evidence: {p.sampleCount} observed payments
          {p.lastOn ? `, most recently ${date(p.lastOn)}` : ""}. Typical amount{" "}
          {formatCents(p.amount)}; observed range {formatCents(p.low)}–
          {formatCents(p.high)}. Timing and account activity suggest a pattern;
          confirm each invoice separately.
        </p>
      ) : null}
      {bill.detail?.liabilityAccountId ? (
        <p className={styles.note}>
          Debt account:{" "}
          {
            data.accounts.find((a) => a.id === bill.detail?.liabilityAccountId)
              ?.nickname
          }
          . Repayment transfers stay excluded from spending.
        </p>
      ) : null}
      {!active ? (
        <p className={styles.note}>
          {p.decision === "candidate"
            ? "Confirm this pattern before tracking invoices."
            : "Tracking is stopped here. Saved invoice history remains available."}
        </p>
      ) : null}
      {data.canEdit && p.kind === "bill" ? (
        p.decision === "candidate" ? (
          <div className={styles.controls}>
            <BillOperation
              label="Confirm bill pattern"
              action={confirmBillAction.bind(null, ...args)}
            />
            <BillOperation
              label="Dismiss pattern"
              action={billDispositionAction.bind(null, ...args, "dismiss")}
            />
          </div>
        ) : (
          <BillOperation
            label={active ? "Stop tracking bill" : "Restore tracking"}
            action={billDispositionAction.bind(
              null,
              ...args,
              active ? "remove" : "restore",
            )}
          />
        )
      ) : null}
      {cycle ? (
        <>
          <h3>{due(cycle)}</h3>
          <span className={styles.status}>{labels[cycle.status]}</span>
          {cycle.dateSource === "predicted" &&
          cycle.dueOn < data.today &&
          !isSettled(cycle) ? (
            <p className={styles.note}>
              Expected payment not confirmed. This prediction does not establish
              a lender deadline.
            </p>
          ) : null}
          {cycle.invoiceCents === null && !cycle.markedPaid ? (
            <p className={styles.note}>
              The invoice amount is unknown. The estimate comes from the
              recurring payment; a matching amount alone cannot prove this
              invoice was paid.
            </p>
          ) : null}
          {cycle.status === "marked_paid" ? (
            <p className={styles.note}>
              Manual confirmation only. No transaction was created and no
              account balance changed.
            </p>
          ) : null}
          <Facts cycle={cycle} />
          {cycle.invoiceCents !== null && cycle.overpaid > 0 ? (
            <p className={styles.note}>
              Linked payments exceed this invoice by{" "}
              {formatCents(cycle.overpaid)}. No excess was allocated to another
              cycle.
            </p>
          ) : null}
          {editable ? (
            <InvoiceForm
              action={saveInvoiceAction.bind(
                null,
                ...args,
                cycle.scheduledOn,
                cycle.revision,
              )}
              cycle={cycle}
            />
          ) : null}
          <h3>Payment evidence</h3>
          {cycle.evidence.length ? (
            <ul className={styles.evidence}>
              {cycle.evidence.map((link) => (
                <li key={link.id}>
                  {formatCents(cents(link.amountCents))} · {date(link.postedOn)}{" "}
                  · {link.description}
                  {!link.valid ? (
                    <p role="status">
                      This payment changed or was removed. Review or unlink this
                      evidence.
                    </p>
                  ) : null}
                  {link.transactionId ? (
                    <p>
                      <Link
                        href={`/w/${data.workspaceId}/transactions/${link.transactionId}`}
                      >
                        View recorded transaction
                      </Link>
                    </p>
                  ) : null}
                  {editable ? (
                    <Confirm
                      label="Unlink payment"
                      consequence="This invoice will no longer count this transaction as its payment. The transaction itself stays."
                    >
                      <BillOperation
                        label="Confirm unlink payment"
                        action={unlinkPaymentAction.bind(
                          null,
                          ...args,
                          cycle.scheduledOn,
                          cycle.revision,
                          link.id,
                        )}
                      />
                    </Confirm>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.note}>
              No posted payments are linked to this invoice.
            </p>
          )}
          {editable ? (
            <>
              <PaymentForm
                action={linkPaymentAction.bind(
                  null,
                  ...args,
                  cycle.scheduledOn,
                  cycle.revision,
                )}
                candidates={data.candidates.rows.filter(
                  (row) =>
                    !cycle.evidence.some(
                      (link) => link.originalTransactionId === row.id,
                    ),
                )}
              />
              {!data.candidates.rows.length ? (
                <p className={styles.note}>
                  No matching posted payments on this page. Pending payments and
                  refunds are excluded. Check the payee in your bill settings
                  and recorded account activity.
                </p>
              ) : null}
              <nav
                className={styles.pager}
                aria-label="Payment candidate pages"
              >
                {data.query.paymentPage > 1 ? (
                  <Link
                    href={`${billHref(data.workspaceId, p.accountId, p.merchant, cycle.scheduledOn)}&paymentPage=${data.query.paymentPage - 1}`}
                  >
                    Previous transactions
                  </Link>
                ) : null}
                {data.candidates.hasMore ? (
                  <Link
                    href={`${billHref(data.workspaceId, p.accountId, p.merchant, cycle.scheduledOn)}&paymentPage=${data.query.paymentPage + 1}`}
                  >
                    More transactions
                  </Link>
                ) : null}
              </nav>
              <BillOperation
                label={
                  cycle.markedPaid
                    ? "Undo manual paid mark"
                    : "Mark paid manually"
                }
                action={markPaidAction.bind(
                  null,
                  ...args,
                  cycle.scheduledOn,
                  cycle.revision,
                  !cycle.markedPaid,
                )}
              />
            </>
          ) : null}
        </>
      ) : (
        <p className={styles.note}>
          There is no projected invoice within the next 90 days. Review the bill
          schedule to enter a first due date.
        </p>
      )}
      {editable ? (
        <details className={styles.panel}>
          <summary>Edit bill settings</summary>
          <BillForm
            editing
            accounts={data.accounts}
            action={updateBillAction.bind(
              null,
              ...args,
              bill.detail?.revision ?? 0,
            )}
            initial={{
              name: p.name,
              merchant: p.merchant,
              accountId: p.accountId,
              amount: toDecimalString(p.amount),
              amountMode: p.amountMode,
              unit: p.unit,
              every: String(p.every),
              nextOn: bill.detail?.anchorOn ?? p.nextOn ?? data.today,
              anchorLocked: bill.detail ? "true" : "",
              useHistory: p.useHistory ? "on" : "",
              autopay: bill.detail?.autopay ? "on" : "",
              liabilityAccountId: bill.detail?.liabilityAccountId ?? "",
            }}
          />
        </details>
      ) : null}
      <h3>Saved invoice history</h3>
      {history.length ? (
        <>
          <ul className={styles.history}>
            {historyRows.map((c) => (
              <li key={c.scheduledOn}>
                <Link
                  href={billHref(
                    data.workspaceId,
                    p.accountId,
                    p.merchant,
                    c.scheduledOn,
                  )}
                >
                  {due(c)}
                </Link>{" "}
                · {labels[c.status]} ·{" "}
                {formatCents(cents(c.invoiceCents ?? c.estimateCents))}
                {c.invoiceCents === null ? " estimated" : ""}
              </li>
            ))}
          </ul>
          <nav className={styles.pager} aria-label="Saved invoice pages">
            {historyPage > 1 ? (
              <Link
                href={`${billHref(data.workspaceId, p.accountId, p.merchant, cycle?.scheduledOn)}&historyPage=${historyPage - 1}`}
              >
                Newer invoices
              </Link>
            ) : null}
            {historyPage < historyPages ? (
              <Link
                href={`${billHref(data.workspaceId, p.accountId, p.merchant, cycle?.scheduledOn)}&historyPage=${historyPage + 1}`}
              >
                Older invoices
              </Link>
            ) : null}
          </nav>
        </>
      ) : (
        <p className={styles.note}>
          History starts when an invoice or payment confirmation is saved.
          Predictions do not invent past unpaid bills.
        </p>
      )}
    </section>
  );
}
export function BillsPage({ data }: { data: BillsView }) {
  const view = data.query.view;
  const entries = data.bills
    .filter(
      (b) => !data.query.account || b.payment.accountId === data.query.account,
    )
    .flatMap((bill): { bill: BillRecord; cycle: CycleView | null }[] => {
      const next = bill.cycles.find((c) => !isSettled(c)) ?? null;
      if (view === "history")
        return bill.cycles
          .filter((c) => c.id !== null)
          .map((cycle) => ({ bill, cycle }));
      if (view === "archived")
        return bill.payment.decision === "dismissed" ||
          bill.payment.kind !== "bill"
          ? [{ bill, cycle: next }]
          : [];
      if (view === "review")
        return bill.payment.decision === "candidate" ||
          (tracked(bill) &&
            (!next || next.needsReview || next.dateSource === "predicted"))
          ? [{ bill, cycle: next }]
          : [];
      if (!tracked(bill)) return [];
      if (view === "soon")
        return bill.cycles
          .filter(
            (c) =>
              !isSettled(c) &&
              c.dueOn >= data.today &&
              c.dueOn <= shiftDays(data.today, 7),
          )
          .map((cycle) => ({ bill, cycle }));
      return [{ bill, cycle: next }];
    })
    .filter(
      ({ cycle }) =>
        (!data.query.from ||
          Boolean(cycle && cycle.dueOn >= data.query.from)) &&
        (!data.query.to || Boolean(cycle && cycle.dueOn <= data.query.to)),
    )
    .sort((a, b) =>
      view === "history"
        ? (b.cycle?.dueOn ?? "").localeCompare(a.cycle?.dueOn ?? "")
        : (a.cycle?.dueOn ?? "9999").localeCompare(b.cycle?.dueOn ?? "9999") ||
          a.bill.payment.name.localeCompare(b.bill.payment.name),
    );
  const pages = Math.max(1, Math.ceil(entries.length / 20));
  const page = Math.min(data.query.page, pages);
  const rows = entries.slice((page - 1) * 20, page * 20);
  const soon = data.bills
    .filter(
      (b) =>
        tracked(b) &&
        (!data.query.account || b.payment.accountId === data.query.account),
    )
    .flatMap((b) => b.cycles)
    .filter(
      (c) =>
        !isSettled(c) &&
        c.dueOn >= data.today &&
        c.dueOn <= shiftDays(data.today, 7),
    ).length;
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>Bills</h1>
          <p>What is due, what has been paid and what remains this cycle.</p>
        </div>
        <Link href={`/w/${data.workspaceId}/subscriptions`}>
          Recurring payments
        </Link>
      </header>
      {!data.canEdit ? (
        <p className={styles.note}>
          You have view-only access. An editor can change bills and payment
          confirmations.
        </p>
      ) : null}
      <section aria-label="Recorded cash versus bills">
        <dl className={styles.summary}>
          <div>
            <dt>Recorded liquid cash</dt>
            <dd>
              {data.cash.accounts.length
                ? formatCents(data.cash.recordedCash)
                : "Not available"}
            </dd>
          </div>
          <div>
            <dt>Known invoices remaining</dt>
            <dd>{formatCents(data.cash.known)}</dd>
          </div>
          <div>
            <dt>Additional estimated bills</dt>
            <dd>{formatCents(data.cash.estimated)}</dd>
          </div>
          <div>
            <dt>Cash after known and estimated bills</dt>
            <dd>
              {data.cash.accounts.length
                ? formatCents(data.cash.afterEstimated)
                : "Not available"}
            </dd>
          </div>
        </dl>
        <p className={styles.note}>
          Next 30 days plus unresolved user-entered past invoices. This compares
          recorded cash with bills; everyday spending and one-off plans are
          outside these totals.
        </p>
        {data.cash.missingInvoices ? (
          <p className={styles.note}>
            {data.cash.missingInvoices} upcoming{" "}
            {data.cash.missingInvoices === 1 ? "invoice is" : "invoices are"}{" "}
            estimated. Actual amounts may differ.
          </p>
        ) : null}
        {data.cash.accounts.length ? (
          <p className={styles.note}>
            Balance dates:{" "}
            {data.cash.accounts
              .map(
                (a) =>
                  `${a.nickname}: ${a.balanceAsOf ? date(a.balanceAsOf) : "not recorded"}`,
              )
              .join("; ")}
            . Recorded balances do not guarantee a payment will succeed.
          </p>
        ) : null}
        {soon ? (
          <p role="status">
            <Link href={listHref(data, 1, "soon")}>
              {soon} {soon === 1 ? "bill is" : "bills are"} due or expected
              within seven days.
            </Link>
          </p>
        ) : null}
      </section>
      {data.canEdit ? (
        data.accounts.some((a) => a.type !== "loan") ? (
          <details className={styles.add}>
            <summary>Add a bill</summary>
            <BillForm
              action={createBillAction.bind(null, data.workspaceId)}
              accounts={data.accounts}
              initial={{ nextOn: data.today }}
            />
          </details>
        ) : (
          <p className={styles.note}>
            <Link href={`/w/${data.workspaceId}/accounts/new`}>
              Add a payment account
            </Link>{" "}
            to start tracking bills.
          </p>
        )
      ) : null}
      <nav className={styles.tabs} aria-label="Bill views">
        {(
          [
            ["upcoming", "Upcoming"],
            ["soon", "Due soon"],
            ["review", "Needs review"],
            ["history", "History"],
            ["archived", "Stopped"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={listHref(data, 1, value)}
            aria-current={view === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form
        className={styles.filters}
        aria-label="Filter bills"
        action={`/w/${data.workspaceId}/bills`}
      >
        <input type="hidden" name="view" value={view} />
        <div className={styles.field}>
          <label htmlFor="bills-filter-account">Account</label>
          <select
            id="bills-filter-account"
            name="account"
            defaultValue={data.query.account ?? ""}
          >
            <option value="">All accounts</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
        </div>
        <label>
          From date
          <input type="date" name="from" defaultValue={data.query.from ?? ""} />
        </label>
        <label>
          To date
          <input type="date" name="to" defaultValue={data.query.to ?? ""} />
        </label>
        <button type="submit">Apply filters</button>
      </form>
      <BillDetail data={data} />
      <section aria-label="Bill list">
        <p className={styles.note}>
          {entries.length} {view === "history" ? "saved invoices" : "bills"} ·
          Page {page} of {pages}
        </p>
        {rows.length ? (
          <div className={styles.cards}>
            {rows.map(({ bill, cycle }) => (
              <article
                className={styles.card}
                key={`${bill.payment.key}:${cycle?.scheduledOn ?? "none"}`}
                aria-label={bill.payment.name}
              >
                <h2>
                  <Link
                    href={billHref(
                      data.workspaceId,
                      bill.payment.accountId,
                      bill.payment.merchant,
                      cycle?.scheduledOn,
                    )}
                  >
                    {bill.payment.name}
                  </Link>
                </h2>
                <p className={styles.note}>
                  {
                    data.accounts.find((a) => a.id === bill.payment.accountId)
                      ?.nickname
                  }{" "}
                  · {bill.payment.cadence}
                </p>
                {cycle ? (
                  <>
                    <p>{due(cycle)}</p>
                    <span className={styles.status}>
                      {labels[cycle.status]}
                    </span>
                    <Facts cycle={cycle} />
                  </>
                ) : (
                  <p>
                    {bill.payment.decision === "candidate"
                      ? "Suggested pattern; confirmation needed."
                      : "No open invoice projected within 90 days."}
                  </p>
                )}
                {bill.detail?.autopay ? (
                  <p className={styles.note}>Autopay noted</p>
                ) : null}
                {bill.payment.amountMode === "variable" ? (
                  <p className={styles.note}>
                    Observed range: {formatCents(bill.payment.low)}–
                    {formatCents(bill.payment.high)}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p>
            {view === "history"
              ? "No saved invoices yet."
              : view === "soon"
                ? "No bills due or expected within seven days."
                : view === "review"
                  ? "No bills need review in this view."
                  : view === "archived"
                    ? "No stopped bills in this view."
                    : "No confirmed bills yet. Add a bill or confirm a recurring bill pattern."}
          </p>
        )}
        <nav className={styles.pager} aria-label="Bill list pages">
          {page > 1 ? (
            <Link href={listHref(data, page - 1)}>Previous bills</Link>
          ) : null}
          {page < pages ? (
            <Link href={listHref(data, page + 1)}>Next bills</Link>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
