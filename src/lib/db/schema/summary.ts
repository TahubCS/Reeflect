// The dashboard's Gemini summary (F-15, ADR-068, ARCH-03): one row for each
// time a member asked Gemini to write it. The rows are the daily limit for
// each person, and the newest one with a draft is what the workspace sees
// for the rest of that day.
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../id";
import { organization, user } from "./auth";

export const summaryWrite = pgTable(
  "summary_write",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Who asked: the daily limit is theirs. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The day it was asked for, in the app's time zone. */
    writtenOn: date("written_on", { mode: "string" }).notNull(),
    /**
     * What the model wrote, with labels where the figures go: never an
     * amount (ADR-019). Null when no model answered or its draft broke a
     * rule; the row still counts toward the limit.
     */
    draft: jsonb("draft").$type<{ summary: string; suggestions: string[] }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("summary_write_user_day_idx").on(table.userId, table.writtenOn),
    index("summary_write_workspace_day_idx").on(
      table.workspaceId,
      table.writtenOn,
      table.createdAt,
    ),
    check(
      "summary_write_draft_check",
      sql`${table.draft} is null or jsonb_typeof(${table.draft}) = 'object'`,
    ),
  ],
);
