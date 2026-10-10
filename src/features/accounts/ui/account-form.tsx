"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_OPTIONS,
  type AccountFormState,
  type AccountType,
  balanceLabel,
} from "../domain/account-input";
import styles from "./accounts.module.css";

export type AccountFormValues = {
  type: AccountType;
  institutionName: string;
  nickname: string;
  maskLast4: string;
  /** As typed: a plain amount, owed for cards and loans. */
  balance: string;
};

type Props = {
  /** The server action with the workspace (and account) ids bound. */
  action: (
    previous: AccountFormState,
    formData: FormData,
  ) => Promise<AccountFormState>;
  initial: AccountFormValues;
  /** False for a synced account: its type and balance come from the source. */
  balanceEditable: boolean;
  submitLabel: string;
  busyLabel: string;
  cancelHref: string;
};

type FieldProps = {
  name: string;
  label: string;
  error: string | undefined;
  hint?: string;
  defaultValue: string;
  inputMode?: "numeric" | "decimal";
  autoComplete?: string;
};

function Field({
  name,
  label,
  error,
  hint,
  defaultValue,
  inputMode,
  autoComplete = "off",
}: FieldProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="text"
        defaultValue={defaultValue}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(id, error, hint)}
      />
      <Note id={id} error={error} hint={hint} />
    </div>
  );
}

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

/** Add or edit a bank or card account (F-03). */
export function AccountForm({
  action,
  initial,
  balanceEditable,
  submitLabel,
  busyLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const [type, setType] = useState<AccountType>(initial.type);
  const typeId = useId();
  const { errors } = state;
  // After a rejected submit, show what was typed rather than the start values.
  const value = (name: keyof AccountFormValues): string =>
    state.values?.[name] ?? initial[name];

  return (
    <form action={formAction} className={styles.form} noValidate>
      {balanceEditable ? (
        <div className={styles.field}>
          <label htmlFor={typeId}>Account type</label>
          <select
            id={typeId}
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as AccountType)}
            aria-invalid={errors.type !== undefined}
            aria-describedby={describedBy(typeId, errors.type, undefined)}
          >
            {ACCOUNT_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {ACCOUNT_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
          <Note id={typeId} error={errors.type} />
        </div>
      ) : (
        <input type="hidden" name="type" value={type} />
      )}

      <Field
        name="institutionName"
        label="Bank or card issuer"
        error={errors.institutionName}
        defaultValue={value("institutionName")}
        autoComplete="organization"
      />
      <Field
        name="nickname"
        label="Nickname"
        error={errors.nickname}
        hint="What you call it, like “Everyday checking”."
        defaultValue={value("nickname")}
      />
      <Field
        name="maskLast4"
        label="Last 4 digits (optional)"
        error={errors.maskLast4}
        hint="Only the last 4. Never enter the full number."
        defaultValue={value("maskLast4")}
        inputMode="numeric"
      />
      {balanceEditable ? (
        <Field
          name="balance"
          label={balanceLabel(type)}
          error={errors.balance}
          hint={
            type === "checking" || type === "savings"
              ? "Use a minus sign if the account is overdrawn."
              : "What you owe today, as a plain amount."
          }
          defaultValue={value("balance")}
          inputMode="decimal"
        />
      ) : (
        <p className={styles.hint}>
          This account’s type and balance come from its bank connection and
          update when it syncs.
        </p>
      )}

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
