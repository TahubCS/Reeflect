import { hasOwnDigits } from "@/lib/ai/digitScan";
import { fill } from "@/lib/ai/fill";
import type { Facts } from "./summary";

/** A text message, not an essay: longer than this and the model rambled. */
export const MAX_REPLY_LENGTH = 700;

export type CheckedDraft =
  | { ok: true; text: string }
  | {
      ok: false;
      reason: "digits" | "unknown_label" | "stray_brace" | "too_long";
    };

/**
 * A model's draft, checked and completed (ADR-019): it may hold no digit of
 * its own and only labels that have values, and then the values go in. The
 * same rule for every model (ADR-059).
 */
export function completeDraft(draft: string, facts: Facts): CheckedDraft {
  if (hasOwnDigits(draft)) return { ok: false, reason: "digits" };
  const filled = fill(draft, facts.values as Record<string, string>);
  if (!filled.ok) return filled;
  if (filled.text.length > MAX_REPLY_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return filled;
}
