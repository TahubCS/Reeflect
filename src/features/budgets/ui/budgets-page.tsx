import Link from "next/link";
import { absolute, formatCents } from "@/lib/money";
import {
  copyBudgetsAction,
  removeBudgetAction,
  saveBudgetAction,
} from "../server/actions";
import type { BudgetsView } from "../server/load";
import { FIRST_MONTH, monthTitle, shiftMonth } from "../domain/months";
import { BudgetForm, BudgetOperation } from "./forms";
import styles from "./budgets.module.css";

export function BudgetsPage({ data }: { data: BudgetsView }) {
  const { workspaceId, month, today, rows, totals, canEdit, isEditor } = data;
  const current = today.slice(0, 7);
  const next = shiftMonth(month, 1);
  const href = (target: string) => `/w/${workspaceId}/budgets?month=${target}`;
  const future = month > current;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Budgets</h1>
          <p>Plan each category for the month and see what remains.</p>
        </div>
        <nav aria-label="Budget months" className={styles.monthNav}>
          {month > FIRST_MONTH ? (
            <Link href={href(shiftMonth(month, -1))}>Previous month</Link>
          ) : null}
          <Link href={href(current)}>This month</Link>
          {next <= shiftMonth(current, 1) ? (
            <Link href={href(next)}>Next month</Link>
          ) : null}
        </nav>
      </header>
      <form
        method="get"
        action={`/w/${workspaceId}/budgets`}
        className={styles.monthForm}
        aria-label="Choose budget month"
      >
        <label htmlFor="budget-month">Month</label>
        <input
          id="budget-month"
          type="month"
          name="month"
          defaultValue={month}
          min={FIRST_MONTH}
          max={shiftMonth(current, 1)}
          required
        />
        <button type="submit">View month</button>
      </form>
      <h2>{monthTitle(month)}</h2>
      <p className={styles.note}>
        {future
          ? "Planning for next month. Actual spending starts when this month arrives."
          : `Based on recorded posted transactions${month === current ? ` through ${today}` : ""}. Refunds reduce spending; marked transfers are excluded.`}
      </p>
      {!canEdit ? (
        <p className={styles.note}>
          {!isEditor
            ? "You have read-only access to this workspace."
            : "Past budgets are read-only. Choose this month or next month to change a plan."}
        </p>
      ) : (
        <p className={styles.note}>
          Allocations stay with this month. A zero budget is a plan to allocate
          $0; removing it leaves the category without a budget.
        </p>
      )}
      <section className={styles.summary} aria-label="Monthly budget totals">
        <div>
          <span>Allocated</span>
          <strong>{formatCents(totals.allocated)}</strong>
        </div>
        <div>
          <span>Spent in budgeted categories</span>
          <strong>{formatCents(totals.budgetedSpending)}</strong>
        </div>
        <div>
          <span>
            {totals.remaining < 0
              ? "Above allocated total"
              : "Remaining in budgeted categories"}
          </span>
          <strong>{formatCents(absolute(totals.remaining))}</strong>
        </div>
        <div>
          <span>Spent without a budget</span>
          <strong>{formatCents(totals.unbudgetedSpending)}</strong>
        </div>
      </section>
      <p className={styles.note}>
        These are category plans, not your available cash. {totals.budgetCount}{" "}
        {totals.budgetCount === 1 ? "category has" : "categories have"} a
        budget. Total recorded spending, including Uncategorized:{" "}
        {formatCents(totals.totalSpending)}.
      </p>
      {!future && totals.recordedRows === 0 ? (
        <p className={styles.empty}>
          No posted transactions recorded for this month.{" "}
          <Link href={`/w/${workspaceId}/import`}>Import a statement</Link> or{" "}
          <Link href={`/w/${workspaceId}/transactions/new`}>
            add a transaction
          </Link>{" "}
          to see spending.
        </p>
      ) : null}
      {totals.budgetCount === 0 ? (
        <p className={styles.empty}>
          No budgets set for this month.
          {canEdit
            ? " Set an allocation below to start your plan."
            : " Recorded spending is shown below."}
        </p>
      ) : null}
      {canEdit ? (
        <section className={styles.copy} aria-label="Copy previous budgets">
          <p>
            Copy allocations from {monthTitle(shiftMonth(month, -1))} into
            categories without a budget. Existing allocations, including zero,
            are kept.
          </p>
          {data.previousBudgetCount ? (
            <BudgetOperation
              action={copyBudgetsAction.bind(null, workspaceId, month)}
              label="Copy previous month"
            />
          ) : (
            <p className={styles.note}>
              No allocations recorded in the previous month to copy.
            </p>
          )}
        </section>
      ) : null}
      <section aria-label="Category budgets" className={styles.categories}>
        {rows.map((row) => (
          <article key={row.id} aria-label={row.name} className={styles.card}>
            <h3>{row.name}</h3>
            <dl className={styles.figures}>
              <div>
                <dt>Allocation</dt>
                <dd>
                  {row.allocation === null
                    ? "Not set"
                    : formatCents(row.allocation)}
                </dd>
              </div>
              <div>
                <dt>{future ? "Actual spending" : "Spent"}</dt>
                <dd>{formatCents(row.spent)}</dd>
              </div>
              <div>
                <dt>
                  {row.remaining !== null && row.remaining < 0
                    ? "Above plan"
                    : "Remaining"}
                </dt>
                <dd>
                  {row.remaining === null
                    ? "No budget set"
                    : formatCents(absolute(row.remaining))}
                </dd>
              </div>
            </dl>
            {row.progress !== null ? (
              <div
                className={styles.progress}
                role="progressbar"
                aria-label={`${row.name} budget used`}
                aria-valuenow={row.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={`${formatCents(row.spent)} spent of ${formatCents(row.allocation!)}`}
              >
                <span style={{ width: `${row.progress}%` }} />
              </div>
            ) : null}
            {canEdit ? (
              <div className={styles.controls}>
                <BudgetForm
                  key={`${workspaceId}:${month}:${row.id}`}
                  name={row.name}
                  allocation={row.allocation}
                  action={saveBudgetAction.bind(
                    null,
                    workspaceId,
                    month,
                    row.id,
                  )}
                />
                {row.allocation !== null ? (
                  <BudgetOperation
                    action={removeBudgetAction.bind(
                      null,
                      workspaceId,
                      month,
                      row.id,
                    )}
                    label="Remove budget"
                  />
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
        {!rows.length ? (
          <p className={styles.empty}>
            No spending categories have been set up for this workspace.
          </p>
        ) : null}
      </section>
      <section className={styles.explanation} aria-label="Spending coverage">
        <h2>Outside your category plans</h2>
        <p>
          Uncategorized spending:{" "}
          <strong>{formatCents(totals.uncategorized)}</strong>.{" "}
          <Link href={`/w/${workspaceId}/transactions`}>
            Review categories and transfer marks in Transactions
          </Link>
          .
        </p>
        <p className={styles.note}>
          Card purchases count as spending. A card payment or internal transfer
          must be marked as a transfer to avoid counting it again. Totals
          include only the activity recorded here.
        </p>
        {data.excludedCategories.length ? (
          <p className={styles.note}>
            Income and saving categories are outside spending budgets:{" "}
            {data.excludedCategories.map((c) => c.name).join(", ")}.
          </p>
        ) : null}
        <p className={styles.note}>
          Insights shows rolling monthly averages. This page shows actual totals
          for {monthTitle(month)}.
        </p>
      </section>
    </main>
  );
}
