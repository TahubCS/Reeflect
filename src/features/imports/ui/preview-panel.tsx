"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { formatCents, formatSigned } from "@/lib/money";
import { type Check, formatStatementDate } from "../domain/checks";
import type { StatementRow } from "../domain/statement";
import type { CommitFormState, StatementSummary } from "../domain/preview";
import { ChecksList } from "./checks-list";
import styles from "./imports.module.css";
import { StatementSummaryView } from "./statement-summary";

type Props = {
  summary: StatementSummary;
  checks: Check[];
  /** The rows read back from the stored CSV, or why they can't be. */
  rows: { ok: true; rows: StatementRow[] } | { ok: false; message: string };
  newRows: number;
  needsIdentityConfirmation: boolean;
  canEdit: boolean;
  commit: (
    previous: CommitFormState,
    formData: FormData,
  ) => Promise<CommitFormState>;
  discard: () => Promise<void>;
};

function DiscardButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.secondary} disabled={pending}>
      {pending ? "Discarding…" : "Discard"}
    </button>
  );
}

/** A checked statement waiting to be imported or discarded. */
export function PreviewPanel({
  summary,
  checks,
  rows,
  newRows,
  needsIdentityConfirmation,
  canEdit,
  commit,
  discard,
}: Props) {
  const [state, formAction, pending] = useActionState(commit, {});
  const confirmId = useId();
  const hasBalances =
    rows.ok && rows.rows.some((row) => row.runningBalanceCents !== null);
  const commitLabel =
    newRows === 0
      ? "Mark as imported"
      : `Import ${newRows} ${newRows === 1 ? "transaction" : "transactions"}`;

  return (
    <section aria-labelledby="preview-heading">
      <h2 id="preview-heading">Check the statement before importing</h2>
      <StatementSummaryView summary={summary} />
      <h2>Checks</h2>
      <ChecksList checks={checks} />

      <h2>Transactions</h2>
      {rows.ok ? (
        rows.rows.length === 0 ? (
          <p className={styles.note}>
            This statement has no transactions in this period.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col" className={styles.number}>
                    Amount
                  </th>
                  {hasBalances && (
                    <th scope="col" className={styles.number}>
                      Balance
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.rows.map((row, index) => (
                  <tr key={index}>
                    <td>{formatStatementDate(row.postedOn)}</td>
                    <td className={styles.description}>{row.description}</td>
                    <td className={styles.number}>
                      {formatSigned(row.amountCents)}
                    </td>
                    {hasBalances && (
                      <td className={styles.number}>
                        {row.runningBalanceCents === null
                          ? ""
                          : formatCents(row.runningBalanceCents)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <p className={styles.problem} role="alert">
          {rows.message}
        </p>
      )}

      {canEdit && (
        <>
          <form action={formAction}>
            {needsIdentityConfirmation && (
              <label className={styles.confirm} htmlFor={confirmId}>
                <input
                  id={confirmId}
                  type="checkbox"
                  name="confirmIdentity"
                  value="yes"
                />
                <span>
                  This is the first statement for this account. I confirm it is
                  for {summary.institution} ••{summary.last4}.
                </span>
              </label>
            )}
            {state.problem && (
              <p className={styles.problem} role="alert">
                {state.problem}
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.primary}
                disabled={pending || !rows.ok}
              >
                {pending ? "Importing…" : commitLabel}
              </button>
            </div>
          </form>
          <form action={discard} className={styles.actions}>
            <DiscardButton />
          </form>
        </>
      )}
    </section>
  );
}
