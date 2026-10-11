"use client";
import { useActionState, useId } from "react";
import { toDecimalString, type Cents } from "@/lib/money";
import type { FormAction } from "../domain/forms";
import styles from "./budgets.module.css";

export function BudgetForm({
  name,
  allocation,
  action,
}: {
  name: string;
  allocation: Cents | null;
  action: FormAction;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const id = useId();
  const value =
    state.amount ?? (allocation === null ? "" : toDecimalString(allocation));
  return (
    <form
      action={formAction}
      className={styles.form}
      aria-label={`${name} allocation`}
      noValidate
    >
      <label htmlFor={id}>Monthly allocation (USD)</label>
      <div className={styles.inputRow}>
        <input
          id={id}
          key={value}
          name="amount"
          type="text"
          inputMode="decimal"
          maxLength={100}
          defaultValue={value}
          placeholder="0.00"
          aria-invalid={Boolean(state.errors.amount)}
          aria-describedby={state.errors.amount ? `${id}-error` : undefined}
          disabled={pending}
        />
        <button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : allocation === null
              ? "Set budget"
              : "Save budget"}
        </button>
      </div>
      {state.errors.amount ? (
        <p role="alert" id={`${id}-error`}>
          {state.errors.amount}
        </p>
      ) : null}
      {state.errors.form ? <p role="alert">{state.errors.form}</p> : null}
      {state.message ? <p role="status">{state.message}</p> : null}
    </form>
  );
}

export function BudgetOperation({
  action,
  label,
}: {
  action: FormAction;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  return (
    <form action={formAction} className={styles.operation} aria-label={label}>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
      {state.errors.form ? <p role="alert">{state.errors.form}</p> : null}
      {state.message ? <p role="status">{state.message}</p> : null}
    </form>
  );
}
