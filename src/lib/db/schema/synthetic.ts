// Synthetic data batches (ADR-049). A batch is a recipe (spec + seed +
// generator version), so loading it again anywhere gives the same people and
// transactions. Its workspaces are ordinary workspaces in the same tables as
// everyone else's; a `synthetic_workspace` row is the marker. No row = real.
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../id";
import { organization } from "./auth";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const syntheticBatch = pgTable("synthetic_batch", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  label: text("label").notNull(),
  generatorVersion: integer("generator_version").notNull(),
  seed: text("seed").notNull(),
  /** First month of the span, `YYYY-MM`. */
  startMonth: text("start_month").notNull(),
  months: integer("months").notNull(),
  /** Nothing after this date is generated. */
  asOf: date("as_of", { mode: "string" }).notNull(),
  /** The validated spec exactly as loaded, so the batch can be replayed. */
  spec: jsonb("spec").notNull(),
  notes: text("notes"),
  createdBy: text("created_by"),
  /** The database the batch was tried on before being replayed here, if any. */
  promotedFrom: text("promoted_from"),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
});

export const syntheticWorkspace = pgTable(
  "synthetic_workspace",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Restrict: delete the batch's workspaces first (which removes these
    // rows), then the batch. A batch row can never be left without its data
    // being accounted for.
    batchId: text("batch_id")
      .notNull()
      .references(() => syntheticBatch.id, { onDelete: "restrict" }),
    personKey: text("person_key").notNull(),
    persona: text("persona").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("synthetic_workspace_batch_idx").on(table.batchId),
    uniqueIndex("synthetic_workspace_person_uidx").on(
      table.batchId,
      table.personKey,
    ),
  ],
);

/**
 * Each sample person's figures for the insights comparison (ADR-056): one
 * row per person, period and measure, computed by code at batch load or by
 * `pnpm batch rollup`. Money measures are cents per month; counts are plain
 * numbers (see `src/features/insights/domain/metrics.ts`). Deleted with the
 * workspace or the batch.
 */
export const insightSample = pgTable(
  "insight_sample",
  {
    batchId: text("batch_id")
      .notNull()
      .references(() => syntheticBatch.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** 30, 90 or 365, ending on the batch's `as_of`. */
    periodDays: integer("period_days").notNull(),
    measure: text("measure").notNull(),
    value: bigint("value", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.periodDays, table.measure],
    }),
    index("insight_sample_batch_period_idx").on(
      table.batchId,
      table.periodDays,
    ),
  ],
);
