// Workspace-owned categories and literal merchant rules (ADR-013, ADR-015).
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../id";
import { organization } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const category = pgTable(
  "category",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    colorToken: text("color_token").notNull().default("bar"),
    sortOrder: integer("sort_order").notNull(),
    isPreset: boolean("is_preset").notNull().default(true),
    // A stable seed key lets first visits race without duplicating categories,
    // and preserves a renamed preset on subsequent visits.
    presetKey: text("preset_key").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("category_workspace_id_uidx").on(table.workspaceId, table.id),
    uniqueIndex("category_workspace_preset_uidx").on(
      table.workspaceId,
      table.presetKey,
    ),
  ],
);

export const categoryRule = pgTable(
  "category_rule",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    matchType: text("match_type", {
      enum: ["contains", "starts_with", "exact"],
    }).notNull(),
    categoryId: text("category_id").notNull(),
    priority: integer("priority").notNull().default(100),
    origin: text("origin", { enum: ["user", "ai_confirmed"] })
      .notNull()
      .default("user"),
    ...timestamps,
  },
  (table) => [
    index("category_rule_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "category_rule_workspace_category_fk",
      columns: [table.workspaceId, table.categoryId],
      foreignColumns: [category.workspaceId, category.id],
    }),
  ],
);
