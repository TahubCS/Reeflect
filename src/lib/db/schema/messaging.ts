// Phone linking for the iMessage agent (ADR-034, ADR-051, ARCH-03). A phone
// acts as a user only through a verified, non-revoked `messaging_identity`.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "../id";
import { organization, user } from "./auth";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * The same list as `PLATFORMS` in `packages/agent-protocol` (a test checks
 * they match). `terminal` is Spectrum's development chat (ADR-032).
 */
export const MESSAGING_PLATFORMS = ["imessage", "terminal"] as const;

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

/**
 * Spending a phone texted that is waiting for its account (ADR-065): the
 * agent asked "which account?" and the next text may answer. One per phone;
 * a newer question replaces it, and it is ignored ten minutes after
 * `asked_at`.
 */
export const agentPendingLog = pgTable("agent_pending_log", {
  identityId: text("identity_id")
    .primaryKey()
    .references(() => messagingIdentity.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** Positive: what was spent, from the person's own digits (ADR-035). */
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  description: text("description").notNull(),
  day: text("day", { enum: ["today", "yesterday"] }).notNull(),
  /** The accounts that were listed, in the order they were numbered. */
  accountIds: text("account_ids").array().notNull(),
  askedAt: timestamptz("asked_at").notNull(),
});

/**
 * A user's notification settings (F-33, ADR-038, ADR-104). Kept per user,
 * not per phone, so they survive unlinking and linking again. No row means
 * the defaults: quiet from 9 PM to 9 AM.
 */
export const notificationSetting = pgTable(
  "notification_setting",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Minutes after midnight, 0 to 1439, in the workspace time zone. */
    quietStartMinute: smallint("quiet_start_minute").notNull(),
    quietEndMinute: smallint("quiet_end_minute").notNull(),
    /** What a text replaced, so UNDO can put it back. */
    previousStartMinute: smallint("previous_start_minute"),
    previousEndMinute: smallint("previous_end_minute"),
    /** When a text last changed the hours; UNDO reaches back 24 hours. */
    changedByTextAt: timestamptz("changed_by_text_at"),
    /** Each proactive type can be turned off (ADR-038, ADR-105). */
    subscriptionAlerts: boolean("subscription_alerts").notNull().default(true),
    billReminders: boolean("bill_reminders").notNull().default(true),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "notification_setting_quiet_hours_check",
      sql`${table.quietStartMinute} between 0 and 1439 and ${table.quietEndMinute} between 0 and 1439 and ${table.quietStartMinute} <> ${table.quietEndMinute}`,
    ),
  ],
);

export const PROACTIVE_KINDS = ["subscription_alert", "bill_reminder"] as const;
export const PROACTIVE_STATUSES = [
  "queued",
  "sent",
  "cancelled",
  "failed",
] as const;

/**
 * A text Reeflect starts (F-22, F-26, ADR-038, ADR-105). One row per
 * subscription or per bill cycle, so the job tick can run again and again
 * without texting twice. No amounts and no text are kept: the words and,
 * for DETAILS, the amounts are worked out from current data.
 */
export const proactiveMessage = pgTable(
  "proactive_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    identityId: text("identity_id")
      .notNull()
      .references(() => messagingIdentity.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: PROACTIVE_KINDS }).notNull(),
    /** A subscription's payment key, or a bill's key and scheduled date. */
    subjectKey: text("subject_key").notNull(),
    status: text("status", { enum: PROACTIVE_STATUSES })
      .notNull()
      .default("queued"),
    /** Not sent before this: quiet hours and the daily cap move it. */
    notBefore: timestamptz("not_before").notNull(),
    attempts: integer("attempts").notNull().default(0),
    sentAt: timestamptz("sent_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("proactive_message_subject_uidx").on(
      table.workspaceId,
      table.kind,
      table.subjectKey,
    ),
    index("proactive_message_due_idx").on(table.status, table.notBefore),
    index("proactive_message_identity_sent_idx").on(
      table.identityId,
      table.sentAt,
    ),
    check(
      "proactive_message_values_check",
      sql`${table.kind} in ('subscription_alert', 'bill_reminder') and ${table.status} in ('queued', 'sent', 'cancelled', 'failed') and ${table.attempts} >= 0 and char_length(${table.subjectKey}) between 1 and 1200`,
    ),
  ],
);
