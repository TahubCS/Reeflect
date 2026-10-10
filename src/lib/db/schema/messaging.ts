// Phone linking for the iMessage agent (ADR-034, ADR-050, ARCH-03). A phone
// acts as a user only through a verified, non-revoked `messaging_identity`.
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../id";
import { organization, user } from "./auth";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** Terminal (for development) arrives with the worker (ADR-032). */
export const MESSAGING_PLATFORMS = ["imessage"] as const;

export const messagingIdentity = pgTable(
  "messaging_identity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The user's Personal workspace: what a direct chat answers from. */
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: MESSAGING_PLATFORMS }).notNull(),
    /** Normalized phone number or address. Never logged in full. */
    handle: text("handle").notNull(),
    spaceId: text("space_id").notNull(),
    verifiedAt: timestamptz("verified_at").notNull(),
    proactiveOptIn: boolean("proactive_opt_in").notNull().default(false),
    revokedAt: timestamptz("revoked_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("messaging_identity_workspace_idx").on(table.workspaceId),
    // One phone links to one user, and a user has one linked phone.
    uniqueIndex("messaging_identity_active_handle_uidx")
      .on(table.platform, table.handle)
      .where(sql`${table.revokedAt} is null`),
    uniqueIndex("messaging_identity_active_user_uidx")
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

/**
 * A one-time link code. Only a keyed hash is stored. Once a phone texts the
 * code, its handle is recorded here as a request that the user must approve
 * on the website before any identity exists.
 */
export const agentLinkCode = pgTable(
  "agent_link_code",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: timestamptz("expires_at").notNull(),
    /** Set when the request is approved or refused; the code is then dead. */
    usedAt: timestamptz("used_at"),
    platform: text("platform", { enum: MESSAGING_PLATFORMS }),
    handle: text("handle"),
    spaceId: text("space_id"),
    claimedAt: timestamptz("claimed_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [index("agent_link_code_user_idx").on(table.userId)],
);

/** A wrong code texted from a handle; counted to lock out guessing. */
export const agentLinkAttempt = pgTable(
  "agent_link_attempt",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    platform: text("platform", { enum: MESSAGING_PLATFORMS }).notNull(),
    handle: text("handle").notNull(),
    attemptedAt: timestamptz("attempted_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_link_attempt_handle_idx").on(
      table.platform,
      table.handle,
      table.attemptedAt,
    ),
  ],
);
