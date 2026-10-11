"use client";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { cents, formatSigned } from "@/lib/money";
import {
  PAGE_SIZE,
  calendarGap,
  type ReviewData,
  type ReviewFormState,
  type ReviewQuery,
  type ReviewRow,
  type RowReview,
} from "../client";
import styles from "./review.module.css";

type Action = (
  previous: ReviewFormState,
  form: FormData,
) => Promise<ReviewFormState>;
function href(
  workspaceId: string,
  query: ReviewQuery,
  changes: Partial<ReviewQuery>,
) {
  const next = { ...query, ...changes };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(next))
    if (value !== undefined) search.set(key, String(value));
  return `/w/${workspaceId}/transactions/transfers?${search}`;
}
function amount(row: ReviewRow) {
  return Number.isSafeInteger(row.amountCents)
    ? formatSigned(cents(row.amountCents))
    : "Amount needs review";
}
function Fact({ row }: { row: ReviewRow }) {
  return (
    <div className={styles.fact}>
      <strong>{row.accountName}</strong>
      <span>
        {row.postedOn} · {amount(row)}
      </span>
      <span>{row.description}</span>
      <span className={styles.hint}>
        {row.status === "pending" ? "Pending · " : ""}
        {row.isTransfer ? "Transfer label" : "Normal activity"}
      </span>
    </div>
  );
}
function ReviewForm({
  review,
  operation,
  action,
  workspaceId,
  feedback,
}: {
  review: RowReview;
  operation: "pair" | "detach" | "label";
  action: Action;
  workspaceId: string;
  feedback: (state: ReviewFormState) => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState("");
  const [state, formAction, pending] = useActionState(
    async (previous: ReviewFormState, form: FormData) => {
      feedback({});
      const result = await action(previous, form);
      if (result.ok) feedback(result);
      return result;
    },
    {},
  );
  const partner = review.candidates.find((r) => r.id === selected);
  const expected =
    operation === "detach"
      ? review.members
      : operation === "pair" && partner
        ? [review.row, partner]
        : [review.row];
  const title =
    operation === "pair"
      ? "Confirm pairing"
      : operation === "detach"
        ? "Remove pairing, keep transfer labels"
        : review.row.isTransfer
          ? "Count as normal activity"
          : "Mark as an individual transfer";
  const effect =
    operation === "pair"
      ? "Both rows will be labelled transfers and excluded from spending, income and budgets."
      : operation === "detach"
        ? "Only the relationship is removed. Each current label stays as shown; labelled transfers remain excluded from spending and income."
        : review.row.isTransfer
          ? "This row will be counted according to its category and direction."
          : "This row will be excluded from spending, income and budgets without a paired counterpart.";
  return (
    <form
      action={formAction}
      className={styles.controls}
      aria-label={`${title}: ${review.row.description}`}
    >
      {operation === "pair" && (
        <fieldset disabled={pending} className={styles.choices}>
          <legend>Choose a specific counterpart</legend>
          {review.candidates.map((row) => (
            <label className={styles.choice} key={row.id}>
              <input
                type="radio"
                name="counterpart"
                value={row.id}
                checked={selected === row.id}
                onChange={() => setSelected(row.id)}
              />
              <span>
                <strong>{row.accountName}</strong> · {row.postedOn} ·{" "}
                {amount(row)}
                <br />
                {row.description}
                <br />
                <span className={styles.hint}>
                  Equal and opposite amount, different owned account,{" "}
                  {calendarGap(review.row.postedOn, row.postedOn)} calendar
                  day(s) apart.
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <input
        type="hidden"
        name="review"
        value={JSON.stringify({
          operation,
          expected,
          ...(operation === "label"
            ? { transfer: !review.row.isTransfer }
            : {}),
        })}
      />
      <p id={`${id}-effect`} className={styles.hint}>
        {effect}
      </p>
      <label className={styles.choice}>
        <input
          type="checkbox"
          name="confirm"
          aria-describedby={`${id}-effect`}
          disabled={pending}
        />
        <span>
          {operation === "pair"
            ? "I confirm these transactions are between my own accounts"
            : "I confirm this change and its effect"}
        </span>
      </label>
      <button disabled={pending} type="submit">
        {pending ? "Saving…" : title}
      </button>
      {state.message && !state.ok && <p role="alert">{state.message}</p>}
      {state.message?.includes("Bills") && (
        <Link href={`/w/${workspaceId}/bills?account=${review.row.accountId}`}>
          Review payment evidence in Bills
        </Link>
      )}
    </form>
  );
}

export function TransferReviewPage({
  data,
  action,
}: {
  data: ReviewData;
  action: Action;
}) {
  const [feedback, setFeedback] = useState<ReviewFormState>({});
  const { query } = data;
  const base = `/w/${data.workspaceId}/transactions/transfers`;
  const defaultWindow =
    query.from ===
      new Date(new Date(`${data.today}T00:00:00Z`).getTime() - 89 * 86400000)
        .toISOString()
        .slice(0, 10) && query.to === data.today;
  const seen = new Set<string>();
  const rows = data.rows.filter((r) => {
    if (r.row.pairId === null) return true;
    if (seen.has(r.row.pairId)) return false;
    seen.add(r.row.pairId);
    return true;
  });
  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <h1>Review transfers</h1>
        <Link href={`/w/${data.workspaceId}/transactions`}>
          Back to Transactions
        </Link>
      </div>
      <p className={styles.lead}>
        Review recorded transfers between your accounts, including credit-card
        repayments. Equal amounts suggest a match; choose and confirm the
        transactions yourself.
      </p>
      <p className={styles.hint}>
        {defaultWindow ? "90-day review window" : "Selected review window"}:{" "}
        {query.from} through {query.to}. This page shows bounded recorded
        activity, not a complete account history.
      </p>
      {!data.canEdit && (
        <p>
          Viewer access: you can read reviews; an editor or owner can change
          labels and pairings.
        </p>
      )}
      <form
        action={base}
        method="get"
        className={styles.filters}
        aria-label="Transfer filters"
      >
        <label>
          From
          <input
            type="date"
            name="from"
            defaultValue={query.from}
            min="2000-01-01"
            max={data.today}
            required
          />
        </label>
        <label>
          Through
          <input
            type="date"
            name="to"
            defaultValue={query.to}
            min="2000-01-01"
            max={data.today}
            required
          />
        </label>
        <label>
          Account
          <select name="account" defaultValue={query.account ?? ""}>
            <option value="">All accounts</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Counterpart account
          <select name="other" defaultValue={query.other ?? ""}>
            <option value="">All owned counterparts</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Show
          <select name="view" defaultValue={query.view}>
            <option value="review">Activity to review</option>
            <option value="pairs">Pairs and incomplete relationships</option>
            <option value="individual">Individual transfer labels</option>
            <option value="all">All recorded activity</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>
      <nav className={styles.actions} aria-label="Transfer review views">
        <Link
          href={href(data.workspaceId, query, {
            view: "review",
            page: 1,
            source: undefined,
            matchPage: 1,
          })}
        >
          Activity to review
        </Link>
        <Link
          href={href(data.workspaceId, query, {
            view: "pairs",
            page: 1,
            source: undefined,
            matchPage: 1,
          })}
        >
          Pairs
        </Link>
        <Link
          href={href(data.workspaceId, query, {
            view: "individual",
            page: 1,
            source: undefined,
            matchPage: 1,
          })}
        >
          Individual transfers
        </Link>
        <Link
          href={href(data.workspaceId, query, {
            view: "all",
            page: 1,
            source: undefined,
            matchPage: 1,
          })}
        >
          All activity
        </Link>
      </nav>
      {feedback.message && (
        <p className={styles.status} role={feedback.ok ? "status" : "alert"}>
          {feedback.message}
        </p>
      )}
      {!rows.length && (
        <p className={styles.status}>
          No recorded activity in this review. Try another account, view or
          earlier dates.
        </p>
      )}
      <section className={styles.cards} aria-label="Transfer review activity">
        {rows.map((review) => (
          <article
            className={styles.card}
            key={review.row.id}
            aria-label={review.row.description}
          >
            <h2>
              {review.pairStatus === "confirmed"
                ? "Confirmed pair"
                : review.pairStatus === "incomplete"
                  ? "Incomplete pairing"
                  : review.pairStatus === "invalid"
                    ? "Invalid existing pair"
                    : review.row.isTransfer
                      ? "Individual transfer"
                      : "Activity to review"}
            </h2>
            <div className={styles.facts}>
              {(review.members.length ? review.members : [review.row]).map(
                (row) => (
                  <Fact key={row.id} row={row} />
                ),
              )}
            </div>
            {review.row.pairId !== null ? (
              <>
                {review.pairStatus !== "confirmed" && (
                  <p>
                    This relationship needs review. No labels have been changed
                    automatically.
                  </p>
                )}
                {review.groupLimited ? (
                  <p>
                    This legacy group exceeds 50 rows. No repair is offered for
                    a partial group.
                  </p>
                ) : (
                  data.canEdit && (
                    <ReviewForm
                      key={`detach:${review.row.updatedAt}`}
                      review={review}
                      operation="detach"
                      action={action}
                      workspaceId={data.workspaceId}
                      feedback={setFeedback}
                    />
                  )
                )}
              </>
            ) : (
              <>
                {review.matchesLimited ? (
                  <p>
                    More than 2,000 eligible counterparts. Select a counterpart
                    account to refine the review; no partial match list is
                    shown.
                  </p>
                ) : (
                  <>
                    <p>
                      {review.candidateCount === 0
                        ? "No eligible counterpart in the owned accounts and selected counterpart filter."
                        : `${review.candidateCount} eligible counterpart${review.candidateCount === 1 ? "" : "s"}${review.candidateCount > 1 ? "; choose carefully—this match is ambiguous" : "; confirmation is still required"}.`}
                    </p>
                    {review.candidates.length > 0 &&
                      (data.canEdit ? (
                        <ReviewForm
                          key={`pair:${review.row.updatedAt}:${query.matchPage}`}
                          review={review}
                          operation="pair"
                          action={action}
                          workspaceId={data.workspaceId}
                          feedback={setFeedback}
                        />
                      ) : (
                        <div className={styles.facts}>
                          {review.candidates.map((row) => (
                            <Fact key={row.id} row={row} />
                          ))}
                        </div>
                      ))}
                    {review.candidateCount > PAGE_SIZE && (
                      <nav
                        className={styles.actions}
                        aria-label="Counterpart pages"
                      >
                        {query.source && query.matchPage > 1 && (
                          <Link
                            href={href(data.workspaceId, query, {
                              source: review.row.id,
                              matchPage: query.matchPage - 1,
                            })}
                          >
                            Previous counterparts
                          </Link>
                        )}
                        {(query.source ? query.matchPage : 1) * PAGE_SIZE <
                          review.candidateCount && (
                          <Link
                            href={href(data.workspaceId, query, {
                              source: review.row.id,
                              matchPage:
                                (query.source ? query.matchPage : 1) + 1,
                            })}
                          >
                            More counterparts
                          </Link>
                        )}
                      </nav>
                    )}
                  </>
                )}
                {data.canEdit && (
                  <ReviewForm
                    key={`label:${review.row.updatedAt}`}
                    review={review}
                    operation="label"
                    action={action}
                    workspaceId={data.workspaceId}
                    feedback={setFeedback}
                  />
                )}
              </>
            )}
            {data.canEdit && (
              <Link
                href={`/w/${data.workspaceId}/transactions/${review.row.id}`}
              >
                Edit transaction
              </Link>
            )}
          </article>
        ))}
      </section>
      <nav className={styles.actions} aria-label="Activity pages">
        {query.source && (
          <Link
            href={href(data.workspaceId, query, {
              source: undefined,
              matchPage: 1,
            })}
          >
            Back to activity page
          </Link>
        )}
        {!query.source && query.page > 1 && (
          <Link
            href={href(data.workspaceId, query, {
              page: query.page - 1,
              matchPage: 1,
            })}
          >
            Previous activity
          </Link>
        )}
        {data.hasMore && query.page < 1000 && (
          <Link
            href={href(data.workspaceId, query, {
              page: query.page + 1,
              matchPage: 1,
            })}
          >
            More activity
          </Link>
        )}
      </nav>
      {data.hasMore && query.page === 1000 && (
        <p>
          More activity exists beyond this 20,000-row review. Select an account
          or a shorter date range to continue.
        </p>
      )}
      <p className={styles.hint}>
        Review at most 366 days at a time. Counterparts include the three-day
        padding beyond the selected window. Removing a pairing keeps existing
        labels; normal activity requires a separate explicit change.
      </p>
    </main>
  );
}
