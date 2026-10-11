import { withoutLabels } from "./fill";

/**
 * Whether a model's draft contains a digit of its own (ADR-019). Label
 * names may hold digits (`{top_category_1_name}`), so labels are taken out
 * first; any digit left over was written by the model, in any script.
 */
export function hasOwnDigits(draft: string): boolean {
  return /\p{Nd}/u.test(withoutLabels(draft));
}
