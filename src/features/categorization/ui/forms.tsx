"use client";

import { useActionState, useId, useState } from "react";
import type {
  CategorySummary,
  FormAction,
  FormState,
  RuleInput,
  TransactionSummary,
} from "../domain/forms";
import styles from "./categorization.module.css";

function ErrorNote({ error, id }: { error?: string; id: string }) {
  return error ? (
    <p id={id} className={styles.error}>
      {error}
    </p>
  ) : null;
}

function FormError({ state }: { state: FormState }) {
  const error = state.errors.form ?? state.errors.rule;
  return error ? (
    <p role="alert" className={styles.error}>
      {error}
    </p>
  ) : null;
}

function CategoryOptions({ categories }: { categories: CategorySummary[] }) {
  return categories.map((category) => (
    <option key={category.id} value={category.id}>
      {category.name}
    </option>
  ));
}

function RuleFields({
  initial,
  state,
  categories,
  includeCategory = true,
}: {
  initial: RuleInput;
  state: FormState;
  categories: CategorySummary[];
  includeCategory?: boolean;
}) {
  const id = useId();
  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${id}-pattern`}>Merchant keyword</label>
        <input
          id={`${id}-pattern`}
          name="pattern"
          type="text"
          maxLength={500}
          defaultValue={state.values?.pattern ?? initial.pattern}
          required
          aria-invalid={!!state.errors.pattern}
          aria-describedby={
            state.errors.pattern ? `${id}-pattern-error` : undefined
          }
        />
        <ErrorNote id={`${id}-pattern-error`} error={state.errors.pattern} />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-match`}>Match type</label>
        <select
          id={`${id}-match`}
          name="matchType"
          defaultValue={state.values?.matchType ?? initial.matchType}
          aria-invalid={!!state.errors.matchType}
          aria-describedby={
            state.errors.matchType ? `${id}-match-error` : undefined
          }
        >
          <option value="contains">Contains keyword</option>
          <option value="starts_with">Starts with keyword</option>
          <option value="exact">Exact merchant name</option>
        </select>
        <ErrorNote id={`${id}-match-error`} error={state.errors.matchType} />
      </div>
      {includeCategory && (
        <div className={styles.field}>
          <label htmlFor={`${id}-category`}>Category</label>
          <select
            id={`${id}-category`}
            name="categoryId"
            defaultValue={state.values?.categoryId ?? initial.categoryId}
            aria-invalid={!!state.errors.categoryId}
            aria-describedby={
              state.errors.categoryId ? `${id}-category-error` : undefined
            }
          >
            <option value="">Choose a category</option>
            <CategoryOptions categories={categories} />
          </select>
          <ErrorNote
            id={`${id}-category-error`}
            error={state.errors.categoryId}
          />
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor={`${id}-priority`}>Priority</label>
        <input
          id={`${id}-priority`}
          name="priority"
          type="number"
          step={1}
          min={-1_000_000}
          max={1_000_000}
          defaultValue={state.values?.priority ?? String(initial.priority)}
          required
          aria-invalid={!!state.errors.priority}
          aria-describedby={`${id}-priority-note`}
        />
        <p
          id={`${id}-priority-note`}
          className={state.errors.priority ? styles.error : styles.note}
        >
          {state.errors.priority ??
            "The highest number wins when several rules match."}
        </p>
      </div>
    </>
  );
}

export function RuleForm({
  action,
  initial,
  categories,
  submitLabel,
}: {
  action: FormAction;
  initial: RuleInput;
  categories: CategorySummary[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  return (
    <form
      action={formAction}
      className={styles.form}
      noValidate
      aria-label={submitLabel}
    >
      <RuleFields initial={initial} state={state} categories={categories} />
      <FormError state={state} />
      <button type="submit" disabled={pending} className={styles.button}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function OverrideForm({
  action,
  item,
  categories,
}: {
  action: FormAction;
  item: Pick<
    TransactionSummary,
    "id" | "descriptionRaw" | "merchantNormalized" | "categoryId" | "origin"
  >;
  categories: CategorySummary[];
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const [choice, setChoice] = useState(
    item.origin === "manual" ? (item.categoryId ?? "") : "automatic",
  );
  const [saveRule, setSaveRule] = useState(false);
  const id = useId();
  const canSaveRule = choice !== "automatic" && choice !== "";
  return (
    <form
      action={formAction}
      className={styles.form}
      noValidate
      aria-label={`Category for ${item.descriptionRaw}`}
    >
      <input
        type="hidden"
        name="mode"
        value={choice === "automatic" ? "automatic" : "manual"}
      />
      <div className={styles.field}>
        <label htmlFor={`${id}-category`}>Category</label>
        <select
          id={`${id}-category`}
          name="categoryId"
          value={choice}
          onChange={(event) => {
            setChoice(event.target.value);
            if (event.target.value === "automatic" || event.target.value === "")
              setSaveRule(false);
          }}
          aria-invalid={!!state.errors.categoryId}
          aria-describedby={
            state.errors.categoryId
              ? `${id}-category-error`
              : `${id}-category-note`
          }
        >
          <option value="automatic">Use rules automatically</option>
          <option value="">Uncategorized (manual)</option>
          <CategoryOptions categories={categories} />
        </select>
        <p id={`${id}-category-note`} className={styles.note}>
          A manual choice stays in place until you choose “Use rules
          automatically”.
        </p>
        <ErrorNote
          id={`${id}-category-error`}
          error={state.errors.categoryId}
        />
      </div>
      <label className={styles.check}>
        <input
          name="saveRule"
          type="checkbox"
          checked={saveRule}
          disabled={!canSaveRule}
          onChange={(event) => setSaveRule(event.target.checked)}
        />
        Also save a rule for this merchant
      </label>
      {saveRule && (
        <fieldset className={styles.ruleFields}>
          <legend>Rule for matching transactions</legend>
          <RuleFields
            initial={{
              pattern:
                item.merchantNormalized.length <= 500
                  ? item.merchantNormalized
                  : "",
              matchType:
                item.merchantNormalized.length <= 500 ? "exact" : "contains",
              priority: 100,
              categoryId: choice,
            }}
            state={state}
            categories={categories}
            includeCategory={false}
          />
          <p className={styles.note}>
            This rule applies to existing and future matches. Other manual
            choices are kept.
          </p>
        </fieldset>
      )}
      <FormError state={state} />
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Saving…" : "Save category"}
      </button>
    </form>
  );
}

export function DeleteRuleForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={styles.delete}>
      {confirming ? (
        <form action={formAction}>
          <p>
            Delete this rule? Matching transactions will use the remaining
            rules. Manual choices stay saved.
          </p>
          <FormError state={state} />
          <div className={styles.actions}>
            <button type="submit" className={styles.button} disabled={pending}>
              {pending ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Keep rule
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setConfirming(true)}
        >
          Delete rule
        </button>
      )}
    </div>
  );
}

export function RenameCategoryForm({
  action,
  category,
}: {
  action: FormAction;
  category: CategorySummary;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });
  const id = useId();
  return (
    <form
      action={formAction}
      className={styles.rename}
      noValidate
      aria-label={`Rename ${category.name}`}
    >
      <div className={styles.field}>
        <label htmlFor={id}>Category name</label>
        <input
          id={id}
          name="name"
          maxLength={60}
          defaultValue={state.values?.name ?? category.name}
          aria-invalid={!!state.errors.name}
          aria-describedby={state.errors.name ? `${id}-error` : undefined}
        />
        <ErrorNote id={`${id}-error`} error={state.errors.name} />
      </div>
      <button type="submit" className={styles.secondary} disabled={pending}>
        {pending ? "Saving…" : "Rename category"}
      </button>
      <FormError state={state} />
    </form>
  );
}
