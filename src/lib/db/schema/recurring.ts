// Recurring preferences are separate from immutable ledger facts (ADR-058).
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { uuidv7 } from "../id";
import { organization } from "./auth";
import { financialAccount } from "./finance";

export const recurringSeries = pgTable(
  "recurring_series",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    accountId: text("financial_account_id").notNull(),
    merchant: text("merchant_normalized").notNull(),
    name: text("name").notNull(),
    decision: text("decision", {
      enum: ["candidate", "confirmed", "dismissed"],
    })
      .notNull()
      .default("candidate"),
    kind: text("kind", { enum: ["bill", "subscription", "income"] }).notNull(),
    amountMode: text("amount_mode", { enum: ["fixed", "variable"] }).notNull(),
    unit: text("schedule_unit", { enum: ["days", "months"] }).notNull(),
    every: integer("schedule_every").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }),
    baselineAmountCents: bigint("baseline_amount_cents", {
      mode: "number",
    }).notNull(),
    nextOn: date("next_on", { mode: "string" }),
    manual: boolean("manual").notNull().default(false),
    userIntent: text("user_intent", { enum: ["none", "keep", "cancel"] })
      .notNull()
      .default("none"),
    observedOn: date("last_charged_on", { mode: "string" }),
    observedAmountCents: bigint("observed_amount_cents", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("recurring_workspace_idx").on(table.workspaceId),
    uniqueIndex("recurring_workspace_account_merchant_uidx").on(
      table.workspaceId,
      table.accountId,
      table.merchant,
    ),
    foreignKey({
      name: "recurring_workspace_account_fk",
      columns: [table.workspaceId, table.accountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    }).onDelete("cascade"),
    check(
      "recurring_schedule_check",
      sql`${table.every} >= 1 AND ((${table.unit} = 'months' AND ${table.every} <= 36) OR (${table.unit} = 'days' AND ${table.every} <= 730))`,
    ),
    check(
      "recurring_amount_check",
      sql`${table.baselineAmountCents} > 0 AND ${table.baselineAmountCents} <= 10000000000 AND (${table.amountCents} IS NULL OR (${table.amountCents} > 0 AND ${table.amountCents} <= 10000000000))`,
    ),
    check(
      "recurring_choice_check",
      sql`${table.decision} IN ('candidate', 'confirmed', 'dismissed') AND ${table.kind} IN ('bill', 'subscription', 'income') AND ${table.amountMode} IN ('fixed', 'variable') AND ${table.userIntent} IN ('none', 'keep', 'cancel')`,
    ),
    check(
      "recurring_merchant_check",
      sql`char_length(${table.merchant}) BETWEEN 1 AND 500 AND char_length(${table.name}) BETWEEN 1 AND 80`,
    ),
  ],
);
