"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import styles from "./accounts.module.css";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.danger} disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

/**
 * Deleting takes two steps, and the second says what goes with the account
 * (ADR-025). `action` is the delete server action with its ids bound.
 */
export function DeleteAccount({
  nickname,
  action,
}: {
  nickname: string;
  action: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.zone}>
      {confirming ? (
        <form
          action={action}
          className={styles.confirm}
          role="group"
          aria-label="Confirm delete"
        >
          <p>
            Delete {nickname}? Its transactions are deleted with it. This can’t
            be undone.
          </p>
          <div className={styles.actions}>
            <ConfirmButton />
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setConfirming(true)}
        >
          Delete account
        </button>
      )}
    </div>
  );
}
