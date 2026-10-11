import Link from "next/link";
import type { ReactNode } from "react";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_OPTIONS,
  type AccountSummary,
  displayedBalance,
  owesMoney,
} from "../domain/account-input";
import styles from "./accounts.module.css";

type Props = {
  workspaceId: string;
  accounts: AccountSummary[];
  /** Editors and owners see add and edit links; viewers only read. */
  canEdit: boolean;
  /** Where synced accounts come from, with their Sync button (ADR-033). */
  sourcePanel?: ReactNode;
};

/** The workspace's accounts, grouped by type, with exact balances. */
export function AccountList({
  workspaceId,
  accounts,
  canEdit,
  sourcePanel,
}: Props) {
  const base = `/w/${workspaceId}/accounts`;

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <h1>Accounts</h1>
        {canEdit && (
          <Link href={`${base}/new`} className={styles.primary}>
            Add an account
          </Link>
        )}
      </div>

      {sourcePanel}

      {accounts.length === 0 ? (
        <p className={styles.empty}>
          No accounts yet. Add your checking account first; its balance is where
          the calendar starts.
        </p>
      ) : (
        ACCOUNT_TYPE_OPTIONS.map((type) => {
          const ofType = accounts.filter((account) => account.type === type);
          if (ofType.length === 0) return null;
          return (
            <section key={type} className={styles.group}>
              <h2>{ACCOUNT_TYPE_LABELS[type]}</h2>
              <ul className={styles.list}>
                {ofType.map((account) => (
                  <li key={account.id} className={styles.row}>
                    <div className={styles.name}>
                      <span className={styles.nickname}>
                        {account.nickname}
                      </span>
                      <span className={styles.meta}>
                        {account.institutionName}
                        {account.source === "nessie" && " · Synced from Nessie"}
                        {account.maskLast4 && (
                          <>
                            <span aria-hidden="true">
                              {" "}
                              ···{account.maskLast4}
                            </span>
                            <span className="sr-only">
                              , ending in {account.maskLast4}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <p className={styles.balance}>
                      <span className={styles.balanceLabel}>
                        {owesMoney(account.type) ? "Owed" : "Balance"}
                      </span>{" "}
                      {displayedBalance(account.type, account.balanceCents)}
                    </p>
                    {canEdit && (
                      <Link
                        href={`${base}/${account.id}`}
                        className={styles.edit}
                        aria-label={`Edit ${account.nickname}`}
                      >
                        Edit
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
