"use client";

import { type ReactNode, useId, useState } from "react";
import styles from "./transactions.module.css";

/**
 * The older rows of the list, held back until asked for so the rest of the
 * page stays in reach. The button sits after the rows it reveals.
 */
export function ShowMore({
  shown,
  total,
  children,
}: {
  shown: number;
  total: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div id={id} hidden={!open}>
        {children}
      </div>
      <div className={styles.more}>
        <span>
          Showing {open ? total : shown} of {total}
        </span>
        <button
          type="button"
          className={styles.secondary}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? "Show fewer" : `Show ${total - shown} more`}
        </button>
      </div>
    </>
  );
}
