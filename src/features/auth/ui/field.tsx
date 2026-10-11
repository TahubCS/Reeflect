import type { SignUpInput } from "../domain/credentials";
import styles from "./auth.module.css";

type FieldProps = {
  name: keyof SignUpInput;
  label: string;
  type: string;
  autoComplete: string;
  error: string | undefined;
  hint?: string;
  /** What the field starts with; the person can still change it. */
  defaultValue?: string;
};

/** A labelled input with its error or hint, linked for screen readers. */
export function Field({
  name,
  label,
  type,
  autoComplete,
  error,
  hint,
  defaultValue,
}: FieldProps) {
  const describedBy = error
    ? `${name}-error`
    : hint
      ? `${name}-hint`
      : undefined;
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy}
      />
      {error !== undefined && (
        <span id={`${name}-error`} className={styles.fieldError}>
          {error}
        </span>
      )}
      {error === undefined && hint !== undefined && (
        <span id={`${name}-hint`} className={styles.hint}>
          {hint}
        </span>
      )}
    </label>
  );
}
