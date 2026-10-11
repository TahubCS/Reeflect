"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { authFailureMessage } from "../domain/credentials";
import { EMAIL_VERIFIED_PATH } from "../domain/paths";
import styles from "./auth.module.css";

/** Shown after sign-up until the person opens the link we emailed (ADR-052). */
export function CheckInbox({ email }: { email: string }) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  const resend = async () => {
    setPending(true);
    setStatus("");
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: EMAIL_VERIFIED_PATH,
    });
    setPending(false);
    setStatus(
      error ? authFailureMessage(error) : "Sent. Check your inbox again.",
    );
  };

  return (
    <section className={styles.card} aria-labelledby="check-inbox-title">
      <h1 id="check-inbox-title">Check your inbox</h1>
      <p className={styles.lede}>
        We sent a link to <strong>{email}</strong>. Open it to finish creating
        your account. It works for one hour.
      </p>
      <p className={styles.note}>
        Nothing there? Check your spam folder, or send it again.
      </p>
      <button
        type="button"
        className={styles.secondary}
        onClick={resend}
        disabled={pending}
      >
        {pending ? "Sending…" : "Send the link again"}
      </button>
      <p className={styles.status} role="status">
        {status}
      </p>
    </section>
  );
}
