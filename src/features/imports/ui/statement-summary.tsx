import { formatCents } from "@/lib/money";
import { formatStatementDate } from "../domain/checks";
import type { StatementSummary } from "../domain/preview";
import styles from "./imports.module.css";

const NOT_IN_FILE = "Not in this file";

/** What the statement says, with every figure computed by the server. */
export function StatementSummaryView({
  summary,
}: {
  summary: StatementSummary;
}) {
  const items: [string, string][] = [
    [
      "Account",
      `${summary.institution} ${summary.productName} ••${summary.last4}`,
    ],
    [
      "Period",
      `${formatStatementDate(summary.periodStart)} to ${formatStatementDate(summary.periodEnd)}`,
    ],
    [
      "Opening balance",
      summary.openingBalanceCents === null
        ? NOT_IN_FILE
        : formatCents(summary.openingBalanceCents),
    ],
    ["Money in", formatCents(summary.moneyInCents)],
    ["Money out", formatCents(summary.moneyOutCents)],
    [
      "Closing balance",
      summary.closingBalanceCents === null
        ? NOT_IN_FILE
        : formatCents(summary.closingBalanceCents),
    ],
    ["Transactions", String(summary.rowCount)],
  ];
  return (
    <>
      <dl className={styles.summary}>
        {items.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {summary.closingBalanceCents === null && (
        <p className={styles.note}>
          This file has no balances, so there is nothing to add up. Each
          transaction is still checked against the ones already on this account,
          and the account’s balance stays as it is.
        </p>
      )}
    </>
  );
}
