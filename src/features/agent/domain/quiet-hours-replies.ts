import { APP_NAME } from "@/config/app";
import { type QuietHours, formatQuietHours } from "@/features/messaging";

// Every reply about quiet hours (F-33, ADR-038). Written by code; the times
// are the person's own or their saved ones, never a model's.

const EXAMPLE = '"quiet hours 11pm to 7am"';

export const QUIET_HOURS_REPLIES = {
  unclear: `I couldn't read those times. Send them like ${EXAMPLE} or "quiet hours 23:00 to 07:00". Nothing changed.`,
  notSaved: "I couldn't save that, so nothing changed. Try again in a minute.",
} as const;

export function quietHoursSetReply(hours: QuietHours): string {
  return `Quiet hours set: ${formatQuietHours(hours)}. Reply UNDO to go back.`;
}

export function quietHoursShowReply(hours: QuietHours): string {
  return `Your quiet hours are ${formatQuietHours(hours)}, Eastern time. ${APP_NAME} won't text you first during them. To change them, send something like ${EXAMPLE}.`;
}

export function quietHoursUndoneReply(hours: QuietHours): string {
  return `Done. Quiet hours are back to ${formatQuietHours(hours)}.`;
}
