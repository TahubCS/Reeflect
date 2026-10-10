"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth/client";
import {
  type AuthFailure,
  type FieldErrors,
  type SignUpInput,
  authFailureMessage,
  parseSignIn,
  parseSignUp,
} from "../domain/credentials";
import styles from "./auth.module.css";

type Mode = "sign-in" | "sign-up";

const COPY: Record<
  Mode,
  { title: string; lede: string; submit: string; busy: string }
> = {
  "sign-in": {
    title: "Sign in",
    lede: "Welcome back. Your calendar is where you left it.",
    submit: "Sign in",
    busy: "Signing in…",
  },
  "sign-up": {
    title: "Create your account",
    lede: "It takes a minute. No bank login is needed to start.",
    submit: "Create account",
    busy: "Creating your account…",
  },
};

/** Where a signed-in person lands. */
const AFTER_AUTH = "/dashboard";

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

function Field({
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

type Outcome =
  | { kind: "invalid"; errors: FieldErrors }
  | { kind: "failed"; failure: AuthFailure }
  | { kind: "signed-in" };

/** Validates the form, then asks Better Auth. `onSend` runs once input is valid. */
async function authenticate(
  mode: Mode,
  raw: unknown,
  onSend: () => void,
): Promise<Outcome> {
  if (mode === "sign-up") {
    const parsed = parseSignUp(raw);
    if (!parsed.ok) return { kind: "invalid", errors: parsed.errors };
    onSend();
    const { error } = await authClient.signUp.email(parsed.value);
    return error ? { kind: "failed", failure: error } : { kind: "signed-in" };
  }
  const parsed = parseSignIn(raw);
  if (!parsed.ok) return { kind: "invalid", errors: parsed.errors };
  onSend();
  const { error } = await authClient.signIn.email(parsed.value);
  return error ? { kind: "failed", failure: error } : { kind: "signed-in" };
}

export function AuthForm({
  mode,
  defaultEmail = "",
}: {
  mode: Mode;
  /** Already checked by `prefillEmail`. */
  defaultEmail?: string;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState(false);
  const copy = COPY[mode];
  const isSignUp = mode === "sign-up";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const outcome = await authenticate(
      mode,
      Object.fromEntries(new FormData(event.currentTarget)),
      () => {
        setErrors({});
        setFailure("");
        setPending(true);
      },
    );
    if (outcome.kind === "invalid") {
      setFailure("");
      setErrors(outcome.errors);
      return;
    }
    if (outcome.kind === "failed") {
      setPending(false);
      setFailure(authFailureMessage(outcome.failure));
      return;
    }
    router.push(AFTER_AUTH);
  };

  return (
    <form className={styles.card} onSubmit={submit} noValidate>
      <h1>{copy.title}</h1>
      <p className={styles.lede}>{copy.lede}</p>

      <div className={styles.fields}>
        {isSignUp && (
          <Field
            name="name"
            label="Your name"
            type="text"
            autoComplete="name"
            error={errors.name}
          />
        )}
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email}
          defaultValue={defaultEmail}
        />
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          error={errors.password}
          hint={isSignUp ? "At least 8 characters." : undefined}
        />
      </div>

      {failure && (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      )}

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? copy.busy : copy.submit}
      </button>

      <p className={styles.switch}>
        {isSignUp ? (
          <>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/sign-up">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
