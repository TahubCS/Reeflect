// Which Gemini models answer, in the order they are tried (ADR-059).

/** The chain never grows past this: each extra model is another wait. */
export const MAX_MODELS = 6;

/**
 * Strongest first. The first four have a small daily allowance on our key,
 * the last two a large one, so on a busy day the later models carry the
 * load. Every model gets the same instruction and the same checks.
 */
export const DEFAULT_MODELS: readonly string[] = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

/**
 * The chain from `GEMINI_MODELS` (comma-separated), or the default when it
 * is unset or empty. Repeats are dropped and the list is cut at `MAX_MODELS`.
 */
export function parseModels(raw: string | undefined): string[] {
  const named = (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  const chain = named.length > 0 ? named : DEFAULT_MODELS;
  return [...new Set(chain)].slice(0, MAX_MODELS);
}
