// A model writes sentences with labels such as `{cash_total}`; code puts the
// real, formatted values in (ADR-019). The model never sees the values.

/** A label: lowercase words and digits joined by underscores, in braces. */
const LABEL = /\{([a-z][a-z0-9_]*)\}/g;

export type Filled =
  | { ok: true; text: string }
  | { ok: false; reason: "unknown_label" | "stray_brace" };

/** The labels a draft uses, in order, repeats included. */
export function labelsIn(draft: string): string[] {
  return [...draft.matchAll(LABEL)].map((match) => match[1]!);
}

/** The draft with every well-formed label removed, for the digit scan. */
export function withoutLabels(draft: string): string {
  return draft.replace(LABEL, "");
}

/**
 * Replaces each label with its value. Fails, changing nothing, when the
 * draft uses a label that has no value or contains a brace that is not part
 * of a label: either means the model did not follow the format, and a
 * half-filled sentence must never reach a person.
 */
export function fill(
  draft: string,
  values: Readonly<Record<string, string>>,
): Filled {
  if (labelsIn(draft).some((label) => !Object.hasOwn(values, label))) {
    return { ok: false, reason: "unknown_label" };
  }
  if (/[{}]/.test(withoutLabels(draft))) {
    return { ok: false, reason: "stray_brace" };
  }
  return {
    ok: true,
    text: draft.replace(LABEL, (_match, label: string) => values[label]!),
  };
}
