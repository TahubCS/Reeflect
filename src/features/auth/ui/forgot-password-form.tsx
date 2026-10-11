"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth/client";
import {
  type FieldErrors,
  authFailureMessage,
  parseEmailOnly,
} from "../domain/credentials";
import { RESET_PASSWORD_PATH } from "../domain/paths";
import styles from "./auth.module.css";
import { Field } from "./field";

export function ForgotPasswordForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseEmailOnly(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    setFailure("");
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setPending(true);
    const { error } = await authClient.requestPasswordReset({
      email: parsed.value.email,
      redirectTo: RESET_PASSWORD_PATH,
    });
    setPending(false);
    if (error) {
      setFailure(authFailureMessage(error));
      return;
    }
    setSentTo(parsed.value.email);
  };

  if (sentTo !== null) {
    // The same words whether or not the address has an account (ADR-052).
    return (
      <section className={styles.card} aria-labelledby="reset-sent-title">
        <h1 id="reset-sent-title">Check your inbox</h1>
        <p className={styles.lede}>
          If <strong>{sentTo}</strong> has an account, we&apos;ve sent it a link
          to choose a new password. It works for one hour.
        </p>
        <p className={styles.switch}>
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </section>
    );
  }

  return (
    <form className={styles.card} onSubmit={submit} noValidate>
      <h1>Reset your password</h1>
      <p className={styles.lede}>
        Enter your email and we&apos;ll send you a link to choose a new one.
      </p>
      <div className={styles.fields}>
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email}
        />
      </div>
      {failure && (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className={styles.switch}>
        Remembered it? <Link href="/sign-in">Sign in</Link>
      </p>
    </form>
  );
}
