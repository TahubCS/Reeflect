import "server-only";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notificationSetting } from "@/lib/db/schema";
import {
  DEFAULT_QUIET_HOURS,
  type QuietHours,
  isValidQuietHours,
} from "../domain/quiet-hours";

// Quiet hours (F-33, ADR-038, ADR-104), one row per user. No row means the
// defaults. A change made by text keeps what it replaced, so UNDO can put
// it back; a change on the website clears that.

function checked(hours: QuietHours): QuietHours {
  if (!isValidQuietHours(hours)) throw new Error("invalid quiet hours");
  return { startMinute: hours.startMinute, endMinute: hours.endMinute };
}

export async function getQuietHours(userId: string): Promise<QuietHours> {
  const [row] = await db
    .select({
      startMinute: notificationSetting.quietStartMinute,
      endMinute: notificationSetting.quietEndMinute,
    })
    .from(notificationSetting)
    .where(eq(notificationSetting.userId, userId))
    .limit(1);
  return row ?? DEFAULT_QUIET_HOURS;
}

/** Sets quiet hours from the website. */
export async function setQuietHours(
  userId: string,
  hours: QuietHours,
): Promise<void> {
  const { startMinute, endMinute } = checked(hours);
  const values = {
    quietStartMinute: startMinute,
    quietEndMinute: endMinute,
    previousStartMinute: null,
    previousEndMinute: null,
    changedByTextAt: null,
  };
  await db
    .insert(notificationSetting)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: notificationSetting.userId, set: values });
}

/**
 * Sets quiet hours from a text, keeping the old ones for UNDO. The time is
 * the database's own by default, as a text-logged transaction's is, so UNDO
 * compares the two on one clock.
 */
export async function setQuietHoursByText(
  userId: string,
  hours: QuietHours,
  now?: Date,
): Promise<void> {
  const { startMinute, endMinute } = checked(hours);
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        startMinute: notificationSetting.quietStartMinute,
        endMinute: notificationSetting.quietEndMinute,
      })
      .from(notificationSetting)
      .where(eq(notificationSetting.userId, userId))
      .for("update");
    const previous = current ?? DEFAULT_QUIET_HOURS;
    const values = {
      quietStartMinute: startMinute,
      quietEndMinute: endMinute,
      previousStartMinute: previous.startMinute,
      previousEndMinute: previous.endMinute,
      changedByTextAt: now ?? sql`now()`,
    };
    await tx
      .insert(notificationSetting)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: notificationSetting.userId, set: values });
  });
}

const undoableSince = (userId: string, since: Date) =>
  and(
    eq(notificationSetting.userId, userId),
    gte(notificationSetting.changedByTextAt, since),
    isNotNull(notificationSetting.previousStartMinute),
    isNotNull(notificationSetting.previousEndMinute),
  );

/** When a text last changed quiet hours, if UNDO can still take it back. */
export async function quietHoursUndoableAt(
  userId: string,
  since: Date,
): Promise<Date | null> {
  const [row] = await db
    .select({ at: notificationSetting.changedByTextAt })
    .from(notificationSetting)
    .where(undoableSince(userId, since))
    .limit(1);
  return row?.at ?? null;
}

/**
 * Puts back the quiet hours a text replaced, if it was since `since`.
 * Returns the restored hours, or null when there is nothing to undo. Once
 * undone, it cannot be undone again.
 */
export async function undoQuietHours(
  userId: string,
  since: Date,
): Promise<QuietHours | null> {
  const [row] = await db
    .update(notificationSetting)
    .set({
      quietStartMinute: notificationSetting.previousStartMinute,
      quietEndMinute: notificationSetting.previousEndMinute,
      previousStartMinute: null,
      previousEndMinute: null,
      changedByTextAt: null,
    })
    .where(undoableSince(userId, since))
    .returning({
      startMinute: notificationSetting.quietStartMinute,
      endMinute: notificationSetting.quietEndMinute,
    });
  return row ?? null;
}

/** Which proactive texts a user wants (ADR-038, ADR-105). Both by default. */
export type AlertTypes = {
  subscriptionAlerts: boolean;
  billReminders: boolean;
};

export const DEFAULT_ALERT_TYPES: AlertTypes = {
  subscriptionAlerts: true,
  billReminders: true,
};

export async function getAlertTypes(userId: string): Promise<AlertTypes> {
  const [row] = await db
    .select({
      subscriptionAlerts: notificationSetting.subscriptionAlerts,
      billReminders: notificationSetting.billReminders,
    })
    .from(notificationSetting)
    .where(eq(notificationSetting.userId, userId))
    .limit(1);
  return row ?? DEFAULT_ALERT_TYPES;
}

/** Sets them from the website; a new row keeps the default quiet hours. */
export async function setAlertTypes(
  userId: string,
  types: AlertTypes,
): Promise<void> {
  const values = {
    subscriptionAlerts: types.subscriptionAlerts,
    billReminders: types.billReminders,
  };
  await db
    .insert(notificationSetting)
    .values({
      userId,
      quietStartMinute: DEFAULT_QUIET_HOURS.startMinute,
      quietEndMinute: DEFAULT_QUIET_HOURS.endMinute,
      ...values,
    })
    .onConflictDoUpdate({ target: notificationSetting.userId, set: values });
}
