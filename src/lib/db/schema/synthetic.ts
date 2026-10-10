// Synthetic data batches (ADR-048). A batch is a recipe (spec + seed +
// generator version), so loading it again anywhere gives the same people and
// transactions. Its workspaces are ordinary workspaces in the same tables as
// everyone else's; a `synthetic_workspace` row is the marker. No row = real.
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
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
