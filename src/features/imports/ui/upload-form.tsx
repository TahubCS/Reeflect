"use client";

import { useActionState, useId } from "react";
import type { PreviewFormState } from "../domain/preview";
import { ChecksList } from "./checks-list";
import styles from "./imports.module.css";
import { StatementSummaryView } from "./statement-summary";

type Props = {
  action: (
    previous: PreviewFormState,
    formData: FormData,
  ) => Promise<PreviewFormState>;
  accounts: { id: string; label: string }[];
};

/** Choose an account and a PDF statement; the server reads and checks it. */
export function UploadForm({ action, accounts }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const accountId = useId();
  const fileId = useId();

  return (
    <>
      <form action={formAction} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor={accountId}>Account</label>
          <select
            id={accountId}
            name="accountId"
            defaultValue={state.accountId ?? accounts[0]?.id}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={fileId}>Statement (PDF)</label>
          <input
            id={fileId}
            name="statement"
            type="file"
            accept="application/pdf,.pdf"
            required
            aria-describedby={`${fileId}-hint`}
          />
          <span id={`${fileId}-hint`} className={styles.hint}>
            A Capital One 360 checking or savings statement, downloaded as a
            PDF. The file itself isn’t kept.
          </span>
        </div>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={pending}>
            {pending ? "Reading…" : "Read statement"}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {state.problem && (
          <p className={styles.problem} role="alert">
            {state.problem}
          </p>
        )}
        {state.blocked && (
          <section aria-labelledby="blocked-heading">
            <h2 id="blocked-heading">
              This statement can’t be imported as it is
            </h2>
            <p className={styles.lede}>
              Nothing was saved. The checks below say what stopped it.
            </p>
            <StatementSummaryView summary={state.blocked.summary} />
            <ChecksList checks={state.blocked.checks} />
          </section>
        )}
      </div>
    </>
  );
}
