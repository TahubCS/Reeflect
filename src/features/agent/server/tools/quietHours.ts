import "server-only";
import {
  getQuietHours,
  quietHoursUndoableAt,
  setQuietHoursByText,
  undoQuietHours,
} from "@/features/messaging";
import { latestTextTransaction } from "@/features/transactions";
import type { QuietHoursCommand } from "../../domain/quiet-hours-command";
import {
  QUIET_HOURS_REPLIES,
  quietHoursSetReply,
  quietHoursShowReply,
  quietHoursUndoneReply,
} from "../../domain/quiet-hours-replies";
import { UNDO_WINDOW_MS } from "./logSpending";

// Quiet hours by text (F-33, ADR-038, ADR-104). The user comes from the
// verified phone link (ADR-034); code reads the times and saves them.

/** Carries out what `parseQuietHoursCommand` read. Never throws. */
export async function quietHoursTurn(
  command: Exclude<QuietHoursCommand, { type: "none" }>,
  userId: string,
): Promise<string> {
  try {
    if (command.type === "unclear") return QUIET_HOURS_REPLIES.unclear;
    if (command.type === "show") {
      return quietHoursShowReply(await getQuietHours(userId));
    }
    await setQuietHoursByText(userId, command.hours);
    return quietHoursSetReply(command.hours);
  } catch (error) {
    console.error("agent: quiet hours not saved", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return QUIET_HOURS_REPLIES.notSaved;
  }
}

/**
 * UNDO takes back whichever came last within the window: a quiet-hours
 * change or a text-logged spending (ADR-104). Returns the reply when it
 * undid quiet hours, or null to let logging handle UNDO.
 */
export async function undoQuietHoursIfLatest(
  identity: { userId: string; workspaceId: string },
  now: Date = new Date(),
): Promise<string | null> {
  const since = new Date(now.getTime() - UNDO_WINDOW_MS);
  try {
    const changedAt = await quietHoursUndoableAt(identity.userId, since);
    if (changedAt === null) return null;

    const logged = await latestTextTransaction(identity.workspaceId, since);
    if (logged !== null && logged.createdAt > changedAt) return null;

    const restored = await undoQuietHours(identity.userId, since);
    return restored === null ? null : quietHoursUndoneReply(restored);
  } catch (error) {
    // Not handed on to logging: that would undo something else instead.
    console.error("agent: quiet hours not undone", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return QUIET_HOURS_REPLIES.notSaved;
  }
}
