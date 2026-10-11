"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import styles from "./transactions.module.css";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.danger} disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

/**
 * Deleting takes two steps (ADR-025). `action` is the delete server action
 * with its ids bound.
 */
export function DeleteTransaction({
  description,
  action,
}: {
  description: string;
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
          <p>Delete “{description}”? This can’t be undone.</p>
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
          Delete transaction
        </button>
      )}
    </div>
  );
}
