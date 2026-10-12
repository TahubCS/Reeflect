import { hasOwnDigits } from "@/lib/ai/digitScan";
import { fill, labelsIn, withoutLabels } from "@/lib/ai/fill";
import {
  type Facts,
  type Label,
  MONTHLY_LABELS,
  isMonthToDate,
  valuesOf,
} from "./summary";

/** A text message, not an essay: longer than this and the model rambled. */
export const MAX_REPLY_LENGTH = 700;

const CURRENCY_BY_LABEL = /[$€£¥]\s*\{|\}\s*[$€£¥]/;

// "one" is left out: it is mostly "the next one", "no one".
const NUMBER_WORDS =
  /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|hundreds|thousand|thousands|million|millions|dozen|twice|thrice|half|double|triple|quarter)\b/i;

const CLAIMS_ACTION =
  /\bI(?:'ve| have)? (?:just |already )?(?:logged|saved|recorded|removed|deleted|added|undone|undid|changed|set)\b|\b(?:logged|recorded|added|saved|removed) (?:it|that|this)\b/i;

export type CheckedDraft =
  | { ok: true; text: string }
  | {
      ok: false;
      reason:
        | "digits"
        | "unknown_label"
        | "stray_brace"
        | "too_long"
        | "currency_sign"
        | "number_words"
        | "claims_action"
        | "average_not_called_monthly"
        | "month_to_date_not_called_this_month";
    };

/**
 * A model's draft, checked and completed (ADR-019): it may hold no digit of
 * its own and only labels that have values, and then the values go in. The
 * same rule for every model (ADR-059).
 */
export function completeDraft(draft: string, facts: Facts): CheckedDraft {
  if (hasOwnDigits(draft)) return { ok: false, reason: "digits" };
  // Each value carries its own "$": one written next to a label would show
  // as "$$1,500.25".
  if (CURRENCY_BY_LABEL.test(draft)) {
    return { ok: false, reason: "currency_sign" };
  }
  // A number in words is still a number the model made up (ADR-019).
  if (NUMBER_WORDS.test(withoutLabels(draft))) {
    return { ok: false, reason: "number_words" };
  }
  // Only code logs, saves or removes anything (ADR-064); a draft that
  // claims it did would tell the person something that did not happen.
  if (CLAIMS_ACTION.test(draft)) return { ok: false, reason: "claims_action" };
  const used = labelsIn(draft);
  // A monthly average passed off as a total would be a wrong figure, so a
  // draft that uses one must say "a month" (or "monthly") somewhere.
  const usesAverage = used.some((label) => MONTHLY_LABELS.has(label as Label));
  if (usesAverage && !/\bmonth(ly)?\b/i.test(draft)) {
    return { ok: false, reason: "average_not_called_monthly" };
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
