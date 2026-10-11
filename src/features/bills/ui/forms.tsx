"use client";
import { useActionState, useId } from "react";
import { absolute, cents, formatCents, toDecimalString } from "@/lib/money";
import type { FormAction, FormState } from "../domain/forms";
import type { CycleView, PostedFact } from "../domain/cycles";
import styles from "./bills.module.css";

type Choice = { id: string; nickname: string; type: string };
type Field = {
  name: string;
  label: string;
  type?: string;
  readOnly?: boolean;
  choices?: { value: string; label: string }[];
  hint?: string;
};
function Fields({
  fields,
  values,
  state,
  pending,
  prefix,
}: {
  fields: Field[];
  values: Record<string, string>;
  state: FormState;
  pending: boolean;
  prefix: string;
}) {
  return fields.map((field) => {
    const id = `${prefix}-${field.name}`;
    const value = state.values?.[field.name] ?? values[field.name] ?? "";
    const error = state.errors[field.name];
    const shared = {
      id,
      name: field.name,
      defaultValue: value,
      disabled: pending,
      "aria-invalid": Boolean(error),
      "aria-describedby": error
        ? `${id}-error`
        : field.hint
          ? `${id}-hint`
          : undefined,
    };
    return (
      <div className={styles.field} key={field.name}>
        <label htmlFor={id}>{field.label}</label>
        {field.choices ? (
          <select key={value} {...shared} disabled={pending || field.readOnly}>
            {field.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={value}
            {...shared}
            type={field.type ?? "text"}
            readOnly={field.readOnly}
            inputMode={
              field.name.includes("Amount") || field.name === "amount"
                ? "decimal"
                : undefined
            }
            maxLength={
              field.name === "merchant" ? 500 : field.name === "name" ? 80 : 100
            }
          />
        )}
        {field.hint ? (
          <p className={styles.note} id={`${id}-hint`}>
            {field.hint}
          </p>
        ) : null}
        {error ? (
          <p role="alert" id={`${id}-error`}>
            {error}
          </p>
        ) : null}
      </div>
    );
  });
}
function Feedback({ state }: { state: FormState }) {
  return (
    <>
      {state.errors.form ? <p role="alert">{state.errors.form}</p> : null}
      {/* Always there, so the first message is announced too. */}
      <p role="status" className="live-region">
        {state.message}
      </p>
    </>
  );
}
function Check({
  name,
  label,
  initial,
  state,
  pending,
  prefix,
}: {
  name: string;
  label: string;
  initial: boolean;
  state: FormState;
  pending: boolean;
  prefix: string;
}) {
  const checked = state.values ? state.values[name] === "on" : initial;
  return (
    <div>
      <label className={styles.check} htmlFor={`${prefix}-${name}`}>
        <input
          id={`${prefix}-${name}`}
          key={String(checked)}
          type="checkbox"
          name={name}
          defaultChecked={checked}
          disabled={pending}
          aria-invalid={Boolean(state.errors[name])}
          aria-describedby={
            state.errors[name] ? `${prefix}-${name}-error` : undefined
          }
        />
        {label}
      </label>
      {state.errors[name] ? (
        <p role="alert" id={`${prefix}-${name}-error`}>
          {state.errors[name]}
        </p>
      ) : null}
    </div>
  );
}
export function BillForm({
  action,
  accounts,
  initial = {},
  editing = false,
}: {
  action: FormAction;
  accounts: Choice[];
  initial?: Record<string, string>;
  editing?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const id = useId();
  const values = {
    amountMode: "variable",
    unit: "months",
    every: "1",
    accountId: accounts.find((a) => a.type !== "loan")?.id ?? "",
    ...initial,
  };
  const fields: Field[] = [
    { name: "name", label: "Bill name" },
    {
      name: "merchant",
      label: "Payee on transactions",
      readOnly: editing,
      hint: "Use the payee shown in account activity. Leave blank when adding to use the bill name.",
    },
    {
      name: "accountId",
      label: "Payment account",
      readOnly: editing,
      choices: accounts
        .filter((a) => a.type !== "loan")
        .map((a) => ({ value: a.id, label: a.nickname })),
    },
    { name: "amount", label: "Typical amount (USD)" },
    {
      name: "amountMode",
      label: "Amount pattern",
      choices: [
        { value: "variable", label: "Variable" },
        { value: "fixed", label: "Fixed" },
      ],
    },
    {
      name: "unit",
      label: "Repeat unit",
      choices: [
        { value: "months", label: "Months" },
        { value: "days", label: "Days" },
      ],
    },
    { name: "every", label: "Repeat every", type: "number" },
    {
      name: "nextOn",
      label: editing ? "Original schedule anchor" : "First due date",
      type: "date",
      readOnly: editing && Boolean(initial.anchorLocked),
      hint: editing
        ? "Individual invoice dates are corrected below; the original anchor preserves month-end schedules."
        : undefined,
    },
    {
      name: "liabilityAccountId",
      label: "Card or loan being paid (optional)",
      choices: [
        { value: "", label: "Not a debt payment" },
        ...accounts
          .filter((a) => a.type === "credit_card" || a.type === "loan")
          .map((a) => ({ value: a.id, label: a.nickname })),
      ],
    },
  ];
  if (!editing)
    fields.push({
      name: "invoiceAmount",
      label: "Current invoice amount (USD, optional)",
      hint: "Leave blank to use an estimate. Enter 0 when no payment is due this cycle.",
    });
  return (
    <form
      aria-label={editing ? "Bill settings" : "Add a bill"}
      action={formAction}
      className={styles.form}
      noValidate
    >
      <div className={styles.fields}>
        <Fields
          fields={fields}
          values={values}
          state={state}
          pending={pending}
          prefix={id}
        />
      </div>
      <Check
        name="useHistory"
        label="Use observed amounts for future estimates"
        initial={initial.useHistory === "on"}
        state={state}
        pending={pending}
        prefix={id}
      />
      <Check
        name="autopay"
        label="Autopay is set up with the bill provider"
        initial={initial.autopay === "on"}
        state={state}
        pending={pending}
        prefix={id}
      />
      <p className={styles.note}>
        This records a bill. It does not send a payment or set up autopay.
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : editing ? "Save bill settings" : "Add bill"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function InvoiceForm({
  action,
  cycle,
}: {
  action: FormAction;
  cycle: CycleView;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const id = useId();
  return (
    <form
      aria-label="Current invoice"
      action={formAction}
      className={styles.form}
      noValidate
    >
      <div className={styles.fields}>
        <Fields
          fields={[
            { name: "dueOn", label: "Invoice due date", type: "date" },
            {
              name: "invoiceAmount",
              label: "Invoice amount (USD)",
              hint: "Blank means unknown; 0 means no payment due. This changes only this invoice.",
            },
          ]}
          values={{
            dueOn: cycle.dueOn,
            invoiceAmount:
              cycle.invoiceCents === null
                ? ""
                : toDecimalString(cents(cycle.invoiceCents)),
          }}
          state={state}
          pending={pending}
          prefix={id}
        />
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save invoice"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function PaymentForm({
  action,
  candidates,
}: {
  action: FormAction;
  candidates: PostedFact[];
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const id = useId();
  return (
    <form
      aria-label="Link a posted payment"
      action={formAction}
      className={styles.form}
      noValidate
    >
      <Fields
        fields={[
          {
            name: "transactionId",
            label: "Posted payment",
            choices: [
              { value: "", label: "Choose a posted payment" },
              ...candidates.map((row) => ({
                value: row.id,
                label: `${row.postedOn} · ${row.description} · ${formatCents(absolute(cents(row.amountCents)))}`,
              })),
            ],
          },
        ]}
        values={{}}
        state={state}
        pending={pending}
        prefix={id}
      />
      <Check
        name="confirmed"
        label="I confirm this transaction paid this invoice"
        initial={false}
        state={state}
        pending={pending}
        prefix={id}
      />
      <button type="submit" disabled={pending || candidates.length === 0}>
        {pending ? "Saving…" : "Link payment"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function BillOperation({
  action,
  label,
}: {
  action: FormAction;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  return (
    <form action={formAction} aria-label={label} className={styles.operation}>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}
