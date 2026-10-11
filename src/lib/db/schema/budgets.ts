// Monthly allocations only; saving one never changes the ledger (ADR-015).
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../id";
import { organization } from "./auth";
import { category } from "./categorization";

export const budget = pgTable(
  "budget",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull(),
    month: text("month").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("budget_workspace_month_category_uidx").on(
      table.workspaceId,
      table.month,
      table.categoryId,
    ),
    foreignKey({
      name: "budget_workspace_category_fk",
      columns: [table.workspaceId, table.categoryId],
      foreignColumns: [category.workspaceId, category.id],
    }).onDelete("cascade"),
    check(
      "budget_month_check",
      sql`${table.month} ~ '^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "budget_amount_check",
      sql`${table.amountCents} >= 0 AND ${table.amountCents} <= 10000000000`,
    ),
  ],
);
