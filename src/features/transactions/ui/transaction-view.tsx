import type { TransactionSummary } from "../domain/transaction-input";
import { DayGroups } from "./transaction-list";
import styles from "./transactions.module.css";

/**
 * Every transaction in one plain list, newest first, opened in its own
 * window from Transactions. It has no edit links or category controls, so
 * it reads the same for every role.
 */
export function TransactionView({
  workspaceId,
  transactions,
  accountName,
  truncated,
}: {
  workspaceId: string;
  transactions: TransactionSummary[];
  /** The account the list is narrowed to, if any. */
  accountName: string | null;
  /** True when the list stopped at VIEW_ROWS. */
  truncated: boolean;
}) {
  const count = transactions.length;
  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <h1>Transactions, view only</h1>
      </div>
      <p className={styles.viewNote}>
        {truncated ? `The ${count} most recent` : `All ${count}`}{" "}
        {count === 1 ? "transaction" : "transactions"}
        {accountName ? ` in ${accountName}` : ""}, newest first. Nothing here
        can be changed.
      </p>
      {count === 0 ? (
        <p className={styles.empty}>No transactions yet.</p>
      ) : (
        <section aria-label="Your transactions">
          <DayGroups
            transactions={transactions}
            base={`/w/${workspaceId}/transactions`}
            canEdit={false}
          />
        </section>
      )}
    </main>
  );
}
