import Link from "next/link";
import { formatStatementDate } from "../domain/checks";
import styles from "./imports.module.css";

export type WaitingPreview = {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
};

/** Previews saved earlier and not yet imported or discarded. */
export function WaitingList({
  workspaceId,
  previews,
}: {
  workspaceId: string;
  previews: readonly WaitingPreview[];
}) {
  if (previews.length === 0) return null;
  return (
    <section aria-labelledby="waiting-heading">
      <h2 id="waiting-heading">Waiting for you</h2>
      <ul className={styles.waiting}>
        {previews.map((preview) => (
          <li key={preview.id}>
            <span>
              {preview.label}, {formatStatementDate(preview.periodStart)} to{" "}
              {formatStatementDate(preview.periodEnd)}
            </span>
            <Link
              href={`/w/${workspaceId}/import?batch=${preview.id}`}
              className={styles.secondary}
            >
              Review
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
