"use client";
import { type ReactNode, useActionState, useId } from "react";
import type { FormAction } from "../domain/forms";
import type { Payment } from "../domain/payments";
import { formatCents } from "@/lib/money";
import styles from "./recurring.module.css";

export function ActionForm({
  action,
  children,
}: {
  action: FormAction;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  return (
    <form action={formAction} className={styles.actionForm}>
      <fieldset disabled={pending}>{children}</fieldset>
      {pending ? <p role="status">Saving…</p> : null}
      {Object.keys(state.errors).length ? (
        <p role="alert">{Object.values(state.errors).join(" ")}</p>
      ) : null}
    </form>
  );
}

export function PaymentForm({
  action,
  accounts,
  today,
  initial,
}: {
  action: FormAction;
  accounts: { id: string; name: string }[];
  today: string;
  initial?: Payment;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const id = useId();
  const value = (name: string, fallback: string) =>
    state.values?.[name] ?? fallback;
  const errors = state.errors;
  const field = (
    name: string,
    label: string,
    fallback: string,
    type = "text",
  ) => (
    <div className={styles.field}>
      <label htmlFor={`${id}-${name}`}>{label}</label>
      <input
        key={value(name, fallback)}
        id={`${id}-${name}`}
        name={name}
        type={type}
        defaultValue={value(name, fallback)}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
      />
      {errors[name] ? (
        <span id={`${id}-${name}-error`} role="alert">
          {errors[name]}
        </span>
      ) : null}
    </div>
  );
  const choice = (
    name: string,
    label: string,
    fallback: string,
    options: { value: string; label: string }[],
  ) => (
    <div className={styles.field}>
      <label htmlFor={`${id}-${name}`}>{label}</label>
      <select
        key={value(name, fallback)}
        id={`${id}-${name}`}
        name={name}
        defaultValue={value(name, fallback)}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
      >
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {errors[name] ? (
        <span id={`${id}-${name}-error`} role="alert">
          {errors[name]}
        </span>
      ) : null}
    </div>
  );
  return (
    <form action={formAction} className={styles.form} noValidate>
      <fieldset disabled={pending}>
        {initial ? (
          <>
            <input type="hidden" name="accountId" value={initial.accountId} />
            <input type="hidden" name="merchant" value={initial.merchant} />
          </>
        ) : (
          <>
            {choice(
              "accountId",
              "Account",
              accounts[0]?.id ?? "",
              accounts.map((account) => ({
                value: account.id,
                label: account.name,
              })),
            )}
            {field("merchant", "Payee as shown on transactions", "")}
          </>
        )}
        {field("name", "Payment name", initial?.name ?? "")}
        {choice("kind", "Payment kind", initial?.kind ?? "bill", [
          { value: "bill", label: "Bill" },
          { value: "subscription", label: "Subscription" },
          { value: "income", label: "Payday" },
        ])}
        {choice(
          "amountMode",
          "Amount behavior",
          initial?.amountMode ?? "variable",
          [
            { value: "variable", label: "Variable" },
            { value: "fixed", label: "Fixed" },
          ],
        )}
        {field(
          "amount",
          "Amount per payment (USD estimate)",
          initial ? formatCents(initial.amount) : "",
        )}
        <label className={styles.checkbox}>
          <input
            key={state.values?.useHistory}
            type="checkbox"
            name="useHistory"
            defaultChecked={
              state.values
                ? state.values.useHistory === "on"
                : (initial?.useHistory ?? true)
            }
          />
          Use recent charges to update the estimate
        </label>
        {field("every", "Repeat every", String(initial?.every ?? 1), "number")}
        {choice("unit", "Repeat unit", initial?.unit ?? "months", [
          { value: "months", label: "Calendar months" },
          { value: "days", label: "Days" },
        ])}
        {field(
          "nextOn",
          "Next date (entered by you)",
          initial?.nextOn ?? today,
          "date",
        )}
        <p className={styles.note}>
          This schedule tracks an expected payment. It does not record a payment
          or change your balance.
        </p>
        {errors.form ? <p role="alert">{errors.form}</p> : null}
        <button type="submit">
          {pending
            ? "Saving…"
            : initial
              ? "Save corrections"
              : "Add recurring payment"}
        </button>
      </fieldset>
    </form>
  );
}
