// Web invoice facts; schedules remain in recurring_series. No delivery state.
import { sql } from "drizzle-orm";
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
import { uuidv7 } from "../id";
import { organization } from "./auth";
import { financialAccount, transaction } from "./finance";
import { recurringSeries } from "./recurring";

const instant = (name: string) => timestamp(name, { withTimezone: true });
export const billDetails = pgTable(
  "bill_details",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    accountId: text("financial_account_id").notNull(),
    merchant: text("merchant_normalized").notNull(),
    anchorOn: date("anchor_on", { mode: "string" }).notNull(),
    dateSource: text("date_source", { enum: ["user", "predicted"] }).notNull(),
    autopay: boolean("autopay").notNull().default(false),
    liabilityAccountId: text("liability_account_id"),
    revision: integer("revision").notNull().default(1),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("bill_details_workspace_id_uidx").on(t.workspaceId, t.id),
    uniqueIndex("bill_details_series_uidx").on(
      t.workspaceId,
      t.accountId,
      t.merchant,
    ),
    foreignKey({
      name: "bill_details_series_fk",
      columns: [t.workspaceId, t.accountId, t.merchant],
      foreignColumns: [
        recurringSeries.workspaceId,
        recurringSeries.accountId,
        recurringSeries.merchant,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "bill_details_liability_fk",
      columns: [t.workspaceId, t.liabilityAccountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    }).onDelete("cascade"),
    check(
      "bill_details_values_check",
      sql`${t.revision} > 0 AND ${t.dateSource} IN ('user', 'predicted')`,
    ),
  ],
);

export const billCycle = pgTable(
  "bill_cycle",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    billId: text("bill_id").notNull(),
    scheduledOn: date("scheduled_on", { mode: "string" }).notNull(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    dateSource: text("date_source", { enum: ["user", "predicted"] }).notNull(),
    invoiceCents: bigint("invoice_cents", { mode: "number" }),
    estimateCents: bigint("estimate_cents", { mode: "number" }).notNull(),
    markedPaid: boolean("marked_paid").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("bill_cycle_workspace_id_uidx").on(t.workspaceId, t.id),
    uniqueIndex("bill_cycle_identity_uidx").on(
      t.workspaceId,
      t.billId,
      t.scheduledOn,
    ),
    index("bill_cycle_workspace_due_idx").on(t.workspaceId, t.dueOn),
    foreignKey({
      name: "bill_cycle_bill_fk",
      columns: [t.workspaceId, t.billId],
      foreignColumns: [billDetails.workspaceId, billDetails.id],
    }).onDelete("cascade"),
    check(
      "bill_cycle_values_check",
      sql`${t.revision} > 0 AND ${t.dateSource} IN ('user', 'predicted') AND ${t.estimateCents} >= 0 AND ${t.estimateCents} <= 10000000000 AND (${t.invoiceCents} IS NULL OR (${t.invoiceCents} >= 0 AND ${t.invoiceCents} <= 10000000000))`,
    ),
  ],
);

export const billPayment = pgTable(
  "bill_payment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id").notNull(),
    // Separate nullable FK columns retain a review record after ledger deletion.
    evidenceWorkspaceId: text("evidence_workspace_id"),
    transactionId: text("transaction_id"),
    originalTransactionId: text("original_transaction_id").notNull(),
    accountId: text("financial_account_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    postedOn: date("posted_on", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    isTransfer: boolean("is_transfer").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("bill_payment_cycle_idx").on(t.workspaceId, t.cycleId),
    uniqueIndex("bill_payment_allocation_uidx").on(
      t.workspaceId,
      t.originalTransactionId,
    ),
    foreignKey({
      name: "bill_payment_cycle_fk",
      columns: [t.workspaceId, t.cycleId],
      foreignColumns: [billCycle.workspaceId, billCycle.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "bill_payment_account_fk",
      columns: [t.workspaceId, t.accountId],
      foreignColumns: [financialAccount.workspaceId, financialAccount.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "bill_payment_evidence_fk",
      columns: [t.evidenceWorkspaceId, t.transactionId],
      foreignColumns: [transaction.workspaceId, transaction.id],
    }).onDelete("set null"),
    check(
      "bill_payment_values_check",
      sql`${t.amountCents} > 0 AND ${t.amountCents} <= 10000000000 AND ((${t.evidenceWorkspaceId} IS NULL AND ${t.transactionId} IS NULL) OR (${t.evidenceWorkspaceId} IS NOT NULL AND ${t.transactionId} IS NOT NULL AND ${t.evidenceWorkspaceId} = ${t.workspaceId} AND ${t.transactionId} = ${t.originalTransactionId}))`,
    ),
  ],
);
