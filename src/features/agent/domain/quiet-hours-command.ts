import { APP_NAME } from "@/config/app";
import type { QuietHours } from "@/features/messaging";

// Reads "Reeflect, register new quiet hours 11PM to 7 AM" (F-33, ADR-038).
// Code, not a model, reads the times; anything it is not sure of is
// "unclear", and the reply gives an example instead of a guess. Pure.

export type QuietHoursCommand =
  | { type: "none" }
  /** "quiet hours?": tell the person what they are. */
  | { type: "show" }
  | { type: "unclear" }
  | { type: "set"; hours: QuietHours };

const NONE: QuietHoursCommand = { type: "none" };
const UNCLEAR: QuietHoursCommand = { type: "unclear" };

/** Longer than this is a paragraph about something else. */
const MAX_TEXT_LENGTH = 120;

const TRIGGER = /\bquiet[\s-]*hours?\b/;

/** Words around the times that say nothing about them. */
const FILLER = new RegExp(
  `\\b(?:${APP_NAME.toLowerCase()}|please|pls|register|set|change|update|make|new|my|the|to be|are|is|from|what|whats|what's|show|me|now)\\b`,
  "g",
);

/** "11pm", "11 PM", "11:30 p.m.", "23:00", "07:00", "midnight", "noon". */
const TIME =
  "(?:(midnight|noon)|(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?)";
const RANGE = new RegExp(
  `^${TIME}\\s*(?:to|-|–|—|until|till|til|through|thru)\\s*${TIME}$`,
);

/** The minute of the day one matched time stands for, or null if unsure. */
function minuteOf(
  word: string | undefined,
  hourText: string | undefined,
  minuteText: string | undefined,
  meridiem: string | undefined,
): number | null {
  if (word === "midnight") return 0;
  if (word === "noon") return 12 * 60;
  if (hourText === undefined) return null;

  const hour = Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (minute > 59) return null;

  if (meridiem === undefined) {
    // Without AM or PM only the 24-hour form is clear: "23:00", "07:00".
    if (minuteText === undefined || hourText.length !== 2 || hour > 23) {
      return null;
    }
    return hour * 60 + minute;
  }
  if (hour < 1 || hour > 12) return null;
  const pm = meridiem.startsWith("p");
  return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
}

export function parseQuietHoursCommand(text: string): QuietHoursCommand {
  if (text.length > MAX_TEXT_LENGTH) return NONE;
  const lower = text.toLowerCase();
  if (!TRIGGER.test(lower)) return NONE;

  const rest = lower
    .replace(TRIGGER, " ")
    .replace(FILLER, " ")
    .replace(/[,:;?!]+(?=\s|$)/g, " ")
    .replace(/^[\s,:;.?!]+|[\s,:;.?!]+$/g, "")
    .replace(/\s+/g, " ");
  if (rest === "") return { type: "show" };

  const match = RANGE.exec(rest);
  if (!match) return UNCLEAR;
  const start = minuteOf(match[1], match[2], match[3], match[4]);
  const end = minuteOf(match[5], match[6], match[7], match[8]);
  if (start === null || end === null || start === end) return UNCLEAR;
  return { type: "set", hours: { startMinute: start, endMinute: end } };
}
