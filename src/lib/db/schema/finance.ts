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
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../id";
import { organization } from "./auth";
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

// `import_batch_id` arrives with the import table it references (ARCH-03).
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
