import { formatCents } from "@/lib/money";
import { formatStatementDate } from "../domain/checks";
import type { StatementSummary } from "../domain/preview";
import styles from "./imports.module.css";

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
    ["Opening balance", formatCents(summary.openingBalanceCents)],
    ["Money in", formatCents(summary.moneyInCents)],
    ["Money out", formatCents(summary.moneyOutCents)],
    ["Closing balance", formatCents(summary.closingBalanceCents)],
    ["Transactions", String(summary.rowCount)],
  ];
  return (
    <dl className={styles.summary}>
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
