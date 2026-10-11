// Financial accounts and their transactions (ARCH-03). Every row belongs to
// one workspace (ADR-007); deleting the workspace or the account deletes its
// transactions (ADR-025). Money is integer cents, signed from the account
// holder's point of view (ADR-008).
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../id";
import { organization, user } from "./auth";
import { category } from "./categorization";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: "number" });

export const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "credit_card",
  "loan",
] as const;

/** Where a row came from. `synthetic` rows are made by the batch generator (ADR-049). */
export const DATA_SOURCES = [
  "manual",
  "text",
  "csv",
  "pdf",
  "plaid",
  "nessie",
  "synthetic",
] as const;

/** A bank or card account. Better Auth's `account` table is for logins (ADR-006). */
export const financialAccount = pgTable(
  "financial_account",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    institutionName: text("institution_name").notNull(),
    type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
    maskLast4: text("mask_last4"),
    nickname: text("nickname").notNull(),
    source: text("source", { enum: DATA_SOURCES }).notNull(),
    currentBalanceCents: money("current_balance_cents").notNull().default(0),
    balanceAsOf: date("balance_as_of", { mode: "string" }),
    identityConfirmedAt: timestamptz("identity_confirmed_at"),
    plaidAccountId: text("plaid_account_id"),
    nessieAccountId: text("nessie_account_id"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("financial_account_workspace_idx").on(table.workspaceId),
    uniqueIndex("financial_account_workspace_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("financial_account_plaid_uidx").on(
      table.workspaceId,
      table.plaidAccountId,
    ),
    uniqueIndex("financial_account_nessie_uidx").on(
      table.workspaceId,
      table.nessieAccountId,
    ),
  ],
);

/**
 * One statement import (ARCH-03, ADR-010). `preview` writes a `previewed`
 * row and the canonical CSV (ADR-053); `commit` adds the transactions and
 * marks it `committed`. The uploaded PDF is never stored: only its SHA-256.
 */
export const importBatch = pgTable(
  "import_batch",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    financialAccountId: text("financial_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["csv", "pdf", "plaid", "nessie"] }).notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    fileSha256: text("file_sha256"),
    /** What the statement says it is, for the identity confirmation. */
    statementInstitution: text("statement_institution").notNull(),
    statementLast4: text("statement_last4").notNull(),
    productName: text("product_name").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    // Null when the file has no balances, like a card's CSV export (ADR-054).
    openingBalanceCents: money("opening_balance_cents"),
    closingBalanceCents: money("closing_balance_cents"),
    reconciliation: text("reconciliation", {
      enum: ["passed", "failed", "not_applicable"],
    }).notNull(),
    rowsParsed: integer("rows_parsed").notNull(),
    rowsImported: integer("rows_imported").notNull().default(0),
    rowsSkippedDuplicate: integer("rows_skipped_duplicate")
      .notNull()
      .default(0),
    /** The checks as the preview showed them: ids, outcomes and sentences. */
    checks: jsonb("checks").notNull(),
    /** Where the canonical CSV is in the statements bucket, and its SHA-256. */
    csvObjectKey: text("csv_object_key").notNull(),
    csvSha256: text("csv_sha256").notNull(),
    status: text("status", {
      enum: ["previewed", "committed", "rejected"],
    }).notNull(),
    committedAt: timestamptz("committed_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("import_batch_workspace_idx").on(table.workspaceId),
    uniqueIndex("import_batch_account_file_uidx").on(
      table.financialAccountId,
      table.fileSha256,
    ),
  ],
);

export const transaction = pgTable(
  "transaction",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    financialAccountId: text("financial_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    postedOn: date("posted_on", { mode: "string" }).notNull(),
    amountCents: money("amount_cents").notNull(),
    descriptionRaw: text("description_raw").notNull(),
    merchantNormalized: text("merchant_normalized"),
    categoryId: text("category_id"),
    /** Manual choices, including Uncategorized, must survive rule changes. */
    categoryIsManual: boolean("category_is_manual").notNull().default(false),
    status: text("status", { enum: ["pending", "posted"] })
      .notNull()
      .default("posted"),
    isTransfer: boolean("is_transfer").notNull().default(false),
    /** Shared by both sides of a transfer or card payment (ADR-020). */
    transferPairId: text("transfer_pair_id"),
    source: text("source", { enum: DATA_SOURCES }).notNull(),
    /** The source's own id (a Nessie or Plaid transaction id), for re-sync. */
    externalId: text("external_id"),
    /** The import that added this row; null for typed and synced rows. */
    importBatchId: text("import_batch_id").references(() => importBatch.id, {
      onDelete: "set null",
    }),
    /** Duplicate detection within one account (ADR-010). */
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("transaction_workspace_idx").on(table.workspaceId),
    uniqueIndex("transaction_workspace_id_uidx").on(
      table.workspaceId,
      table.id,
    ),
    index("transaction_workspace_posted_idx").on(
      table.workspaceId,
      table.postedOn,
    ),
    index("transaction_account_posted_idx").on(
      table.financialAccountId,
      table.postedOn,
    ),
    uniqueIndex("transaction_account_fingerprint_uidx").on(
      table.financialAccountId,
      table.fingerprint,
    ),
    foreignKey({
      name: "transaction_workspace_category_fk",
      columns: [table.workspaceId, table.categoryId],
      foreignColumns: [category.workspaceId, category.id],
    }),
  ],
);

/**
 * Money the person expects on a later day, typed on the calendar (F-37,
 * ADR-102). Not a transaction: budgets, insights, recurring detection, the
 * agent and account balances never read it. Once its day comes the person
 * confirms it, which adds a manual transaction, or removes it.
 */
export const plannedTransaction = pgTable(
  "planned_transaction",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    financialAccountId: text("financial_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    plannedOn: date("planned_on", { mode: "string" }).notNull(),
    /** Signed per ADR-008: negative is money out of the account. */
    amountCents: money("amount_cents").notNull(),
    description: text("description").notNull(),
    /** Null lets the saved rules choose once it is confirmed (ADR-013). */
    categoryId: text("category_id"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("planned_transaction_workspace_planned_idx").on(
      table.workspaceId,
      table.plannedOn,
    ),
    index("planned_transaction_account_idx").on(table.financialAccountId),
    foreignKey({
      name: "planned_transaction_workspace_category_fk",
      columns: [table.workspaceId, table.categoryId],
      foreignColumns: [category.workspaceId, category.id],
    }),
  ],
);
