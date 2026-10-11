import Link from "next/link";
import type { ReactNode } from "react";
import { formatSigned } from "@/lib/money";
import {
  type AccountChoice,
  type TransactionSummary,
  formatDay,
  groupByDay,
  splitBatches,
} from "../domain/transaction-input";
import { ShowMore } from "./show-more";
import styles from "./transactions.module.css";

type Props = {
  workspaceId: string;
  transactions: TransactionSummary[];
  accounts: AccountChoice[];
  /** The account the list is narrowed to, if any. */
  accountId: string | null;
  /** True when the list stopped at the repository's limit. */
  truncated: boolean;
  /** Editors and owners see add and edit links; viewers only read. */
  canEdit: boolean;
  /** F-08 contributes category labels and correction forms through composition. */
  categoryControls?: Record<string, ReactNode>;
  pagination?: ReactNode;
  children?: ReactNode;
};

function Labels({ transaction }: { transaction: TransactionSummary }) {
  const labels = [
    transaction.status === "pending" && "Pending",
    transaction.isTransfer && "Transfer",
  ].filter((label): label is string => label !== false);
  if (labels.length === 0) return null;
  return (
    <span className={styles.labels}>
      {labels.map((label) => (
        <span key={label} className={styles.label}>
          {label}
        </span>
      ))}
    </span>
  );
}

/** Rows under a heading per day. */
export function DayGroups({
  transactions,
  base,
  canEdit,
  categoryControls,
}: Pick<Props, "transactions" | "canEdit" | "categoryControls"> & {
  base: string;
}) {
  return (
    <>
      {groupByDay(transactions).map((group) => (
        <section key={group.day} className={styles.group}>
          <h2>{formatDay(group.day)}</h2>
          <ul className={styles.list}>
            {group.transactions.map((transaction) => (
              <li key={transaction.id} className={styles.row}>
                <div className={styles.name}>
                  <span className={styles.description}>
                    {transaction.description}
                  </span>
                  <span className={styles.meta}>
                    {transaction.accountNickname}
                    <Labels transaction={transaction} />
                  </span>
                </div>
                <p
                  className={styles.amount}
                  data-direction={transaction.amountCents < 0 ? "out" : "in"}
                >
                  {/* The sign is text, so colour is never the only signal. */}
                  <span className="sr-only">
                    {transaction.amountCents < 0 ? "Money out, " : "Money in, "}
                  </span>
                  {formatSigned(transaction.amountCents)}
                </p>
                {canEdit && (
                  <Link
                    href={`${base}/${transaction.id}`}
                    className={styles.edit}
                    aria-label={`Edit ${transaction.description}`}
                  >
                    Edit
                  </Link>
                )}
                {categoryControls?.[transaction.id] && (
                  <div className={styles.categoryControls}>
                    {categoryControls[transaction.id]}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** The workspace's transactions by day, newest first, with exact amounts. */
export function TransactionList({
  workspaceId,
  transactions,
  accounts,
  accountId,
  truncated,
  canEdit,
  categoryControls,
  pagination,
  children,
}: Props) {
  const base = `/w/${workspaceId}/transactions`;
  const [first = [], ...rest] = splitBatches(transactions);
  const addHref = accountId
    ? `${base}/new?account=${accountId}`
    : `${base}/new`;

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <h1>Transactions</h1>
        {canEdit && accounts.length > 0 && (
          <Link href={addHref} className={styles.primary}>
            Add a transaction
          </Link>
        )}
      </div>

      {accounts.length === 0 ? (
        <p className={styles.empty}>
          Add an account first, then its transactions.{" "}
          <Link href={`/w/${workspaceId}/accounts`}>Go to accounts</Link>
        </p>
      ) : (
        <>
          {/* A plain GET form, so the filter works before scripts load. */}
          <form method="get" action={base} className={styles.filter}>
            <label htmlFor="transactions-account">Account</label>
            <select
              id="transactions-account"
              name="account"
              defaultValue={accountId ?? ""}
            >
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nickname}
                </option>
              ))}
            </select>
            <button type="submit" className={styles.secondary}>
              Show
            </button>
            {/* Every transaction in one plain list, to read or print. */}
            <a
              href={`${base}/view${accountId ? `?account=${accountId}` : ""}`}
              target="_blank"
              rel="noopener"
              className={styles.viewOnly}
            >
              Open a view-only list
              <span className="sr-only"> (opens in a new window)</span>
            </a>
          </form>

          {transactions.length === 0 ? (
            <p className={styles.empty}>No transactions yet.</p>
          ) : (
            <section aria-label="Your transactions">
              <DayGroups
                transactions={first}
                base={base}
                canEdit={canEdit}
                categoryControls={categoryControls}
              />
              {rest.length > 0 && (
                <ShowMore
                  shown={first.length}
                  batches={rest.map((batch) => ({
                    rows: batch.length,
                    content: (
                      <DayGroups
                        transactions={batch}
                        base={base}
                        canEdit={canEdit}
                        categoryControls={categoryControls}
                      />
                    ),
                  }))}
                />
              )}
            </section>
          )}
          {truncated && (
            <p className={styles.hint}>
              Showing the {transactions.length} most recent.
            </p>
          )}
          {pagination}
        </>
      )}
      {children}
    </main>
  );
}
