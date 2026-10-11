import { hasOwnDigits } from "@/lib/ai/digitScan";
import { fill, labelsIn } from "@/lib/ai/fill";
import {
  type Facts,
  type Label,
  MONTHLY_LABELS,
  YEARLY_LABELS,
  isMonthToDate,
  valuesOf,
} from "./summary";

/** A text message, not an essay: longer than this and the model rambled. */
export const MAX_REPLY_LENGTH = 700;

export type CheckedDraft =
  | { ok: true; text: string }
  | {
      ok: false;
      reason:
        | "digits"
        | "unknown_label"
        | "stray_brace"
        | "too_long"
        | "average_not_called_monthly"
        | "yearly_not_called_a_year"
        | "month_to_date_not_called_this_month";
    };

/**
 * A model's draft, checked and completed (ADR-019): it may hold no digit of
 * its own and only labels that have values, and then the values go in. The
 * same rule for every model (ADR-059).
 */
export function completeDraft(draft: string, facts: Facts): CheckedDraft {
  if (hasOwnDigits(draft)) return { ok: false, reason: "digits" };
  const used = labelsIn(draft);
  // A monthly average passed off as a total would be a wrong figure, so a
  // draft that uses one must say "a month" (or "monthly") somewhere.
  const usesAverage = used.some((label) => MONTHLY_LABELS.has(label as Label));
  if (usesAverage && !/\bmonth(ly)?\b/i.test(draft)) {
    return { ok: false, reason: "average_not_called_monthly" };
  }
  // The same for a figure scaled to a year (F-15).
  const usesYearly = used.some((label) => YEARLY_LABELS.has(label as Label));
  if (usesYearly && !/\byear(ly)?\b/i.test(draft)) {
    return { ok: false, reason: "yearly_not_called_a_year" };
  }
  // The other way round too (F-28): a figure for this month so far must
  // not read as an average, or as the total for some other period.
  if (used.some(isMonthToDate) && !/\bthis month\b/i.test(draft)) {
    return { ok: false, reason: "month_to_date_not_called_this_month" };
  }
  const filled = fill(draft, valuesOf(facts));
  if (!filled.ok) return filled;
  if (filled.text.length > MAX_REPLY_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return filled;
}
