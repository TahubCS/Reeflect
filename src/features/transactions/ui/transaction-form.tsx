"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import type {
  AccountChoice,
  TransactionFormField,
  TransactionFormState,
} from "../domain/transaction-input";
import styles from "./transactions.module.css";

export type TransactionFormValues = Record<TransactionFormField, string>;

type Props = {
  /** The server action with the workspace (and transaction) ids bound. */
  action: (
    previous: TransactionFormState,
    formData: FormData,
  ) => Promise<TransactionFormState>;
  initial: TransactionFormValues;
  accounts: AccountChoice[];
  /**
   * False for an imported or synced transaction: only its description and
   * transfer mark can change. `fixedSummary` then says what it is.
   */
  ledgerEditable: boolean;
  fixedSummary?: string;
  /** "YYYY-MM-DD": the latest date the date field accepts. */
  today: string;
  submitLabel: string;
  busyLabel: string;
  cancelHref: string;
};

// The hint or error sits outside the <label>, so a screen reader announces
// the label as the field's name and the note as its description.
function describedBy(
  id: string,
  error: string | undefined,
  hint: string | undefined,
): string | undefined {
  if (error !== undefined) return `${id}-error`;
  return hint !== undefined ? `${id}-hint` : undefined;
}

function Note({
  id,
  error,
  hint,
}: {
  id: string;
  error: string | undefined;
  hint?: string;
}) {
  if (error !== undefined) {
    return (
      <span id={`${id}-error`} className={styles.fieldError}>
        {error}
      </span>
    );
  }
  if (hint === undefined) return null;
  return (
    <span id={`${id}-hint`} className={styles.hint}>
      {hint}
    </span>
  );
}

/** Add or edit a transaction by hand (F-04). */
export function TransactionForm({
  action,
  initial,
  accounts,
  ledgerEditable,
  fixedSummary,
  today,
  submitLabel,
  busyLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const ids = {
    account: useId(),
    date: useId(),
    direction: useId(),
    amount: useId(),
    description: useId(),
  };
  const { errors } = state;
  // After a rejected submit, show what was typed rather than the start values.
  const value = (name: TransactionFormField): string =>
    state.values ? (state.values[name] ?? "") : initial[name];

  return (
    <form action={formAction} className={styles.form} noValidate>
      {ledgerEditable ? (
        <>
          <div className={styles.field}>
            <label htmlFor={ids.account}>Account</label>
            <select
              id={ids.account}
              name="accountId"
              defaultValue={value("accountId")}
              aria-invalid={errors.accountId !== undefined}
              aria-describedby={describedBy(
                ids.account,
                errors.accountId,
                undefined,
              )}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nickname}
                </option>
              ))}
            </select>
            <Note id={ids.account} error={errors.accountId} />
          </div>

          <div className={styles.field}>
            <label htmlFor={ids.date}>Date</label>
            <input
              id={ids.date}
              name="postedOn"
              type="date"
              max={today}
              defaultValue={value("postedOn")}
              aria-invalid={errors.postedOn !== undefined}
              aria-describedby={describedBy(
                ids.date,
                errors.postedOn,
                undefined,
              )}
            />
            <Note id={ids.date} error={errors.postedOn} />
          </div>

          <fieldset
            className={styles.choice}
            aria-describedby={describedBy(
              ids.direction,
              errors.direction,
              "On a card, a purchase is money out and a payment is money in.",
            )}
          >
            <legend>Money out or in</legend>
            <label>
              <input
                type="radio"
                name="direction"
                value="out"
                defaultChecked={value("direction") !== "in"}
              />
              Money out
            </label>
            <label>
              <input
                type="radio"
                name="direction"
                value="in"
                defaultChecked={value("direction") === "in"}
              />
              Money in
            </label>
            <Note
              id={ids.direction}
              error={errors.direction}
              hint="On a card, a purchase is money out and a payment is money in."
            />
          </fieldset>

          <div className={styles.field}>
            <label htmlFor={ids.amount}>Amount</label>
            <input
              id={ids.amount}
              name="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={value("amount")}
              aria-invalid={errors.amount !== undefined}
              aria-describedby={describedBy(
                ids.amount,
                errors.amount,
                undefined,
              )}
            />
            <Note id={ids.amount} error={errors.amount} />
          </div>
        </>
      ) : (
        <p className={styles.hint}>{fixedSummary}</p>
      )}

      <div className={styles.field}>
        <label htmlFor={ids.description}>Description</label>
        <input
          id={ids.description}
          name="description"
          type="text"
          autoComplete="off"
          defaultValue={value("description")}
          aria-invalid={errors.description !== undefined}
          aria-describedby={describedBy(
            ids.description,
            errors.description,
            undefined,
          )}
        />
        <Note id={ids.description} error={errors.description} />
      </div>

      {ledgerEditable && (
        <label className={styles.check}>
          <input
            type="checkbox"
            name="pending"
            defaultChecked={value("pending") === "on"}
          />
          Still pending
        </label>
      )}
      <label className={styles.check}>
        <input
          type="checkbox"
          name="transfer"
          defaultChecked={value("transfer") === "on"}
        />
        Transfer between my own accounts (not spending or income)
      </label>

      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? busyLabel : submitLabel}
        </button>
        <Link href={cancelHref} className={styles.secondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
