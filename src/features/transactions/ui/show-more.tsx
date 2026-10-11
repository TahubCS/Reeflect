"use client";

import { type ReactNode, useId, useState } from "react";
import styles from "./transactions.module.css";

/**
 * The older rows of the list, held back in batches so the rest of the page
 * stays in reach. Each "Show more" reveals the next batch; "Show all"
 * reveals the rest. The buttons sit after the rows they reveal.
 */
export function ShowMore({
  shown,
  batches,
}: {
  /** Rows above, always shown. */
  shown: number;
  /** Each held-back batch, rendered, with its number of rows. */
  batches: { rows: number; content: ReactNode }[];
}) {
  const [open, setOpen] = useState(0);
  const id = useId();
  const total = batches.reduce((sum, batch) => sum + batch.rows, shown);
  const visible = batches
    .slice(0, open)
    .reduce((sum, batch) => sum + batch.rows, shown);
  const next = batches[open];

  return (
    <>
      <div id={id}>
        {batches.map((batch, index) => (
          <div key={index} hidden={index >= open}>
            {batch.content}
          </div>
        ))}
      </div>
      <div className={styles.more}>
        <span>
          Showing {visible} of {total}
        </span>
        {next && (
          <button
            type="button"
            className={styles.secondary}
            aria-controls={id}
            onClick={() => setOpen(open + 1)}
          >
            Show {next.rows} more
          </button>
        )}
        {batches.length - open > 1 && (
          <button
            type="button"
            className={styles.secondary}
            aria-controls={id}
            onClick={() => setOpen(batches.length)}
          >
            Show all
          </button>
        )}
        {open > 0 && (
          <button
            type="button"
            className={styles.secondary}
            aria-controls={id}
            onClick={() => setOpen(0)}
          >
            Show fewer
          </button>
        )}
      </div>
    </>
  );
}
