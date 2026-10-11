"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth/client";
import {
  type FieldErrors,
  authFailureMessage,
  parseNewPassword,
} from "../domain/credentials";
import styles from "./auth.module.css";
import { Field } from "./field";

/** `token` comes from the reset link, already checked by `resetToken`. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseNewPassword(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    setFailure("");
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setPending(true);
    const { error } = await authClient.resetPassword({
      newPassword: parsed.value.password,
      token,
    });
    setPending(false);
    if (error) {
      setFailure(authFailureMessage(error));
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <section className={styles.card} aria-labelledby="reset-done-title">
        <h1 id="reset-done-title">Password changed</h1>
        <p className={styles.lede}>
          You&apos;ve been signed out everywhere else. Sign in with your new
          password.
        </p>
        <Link href="/sign-in" className={styles.submit}>
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <form className={styles.card} onSubmit={submit} noValidate>
      <h1>Choose a new password</h1>
      <div className={styles.fields}>
        <Field
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.password}
          hint="At least 8 characters."
        />
      </div>
      {failure && (
        <p className={styles.failure} role="alert">
          {failure} <Link href="/forgot-password">Send a new link</Link>
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
