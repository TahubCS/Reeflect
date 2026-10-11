// Which Gemini models answer, in the order they are tried (ADR-059).

/** The chain never grows past this: each extra model is another wait. */
export const MAX_MODELS = 6;

/**
 * For real users, on the deployed app. Strongest first: the first four have
 * a small daily allowance on our key and the last a large one, so on a busy
 * day it carries the load. Every model gets the same instruction and checks.
 */
export const USER_MODELS: readonly string[] = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

/**
 * For development and checks on our own machines. It shares no model with
 * `USER_MODELS`: each model has its own daily allowance, so trying things
 * out can never use up what users' texts need.
 */
export const TEST_MODELS: readonly string[] = ["gemini-3.1-flash-lite"];

/**
 * The chain to use. `GEMINI_MODELS` (comma-separated) wins when set;
 * otherwise the deployed app gets `USER_MODELS` and everything else gets
 * `TEST_MODELS`. Repeats are dropped and the list is cut at `MAX_MODELS`.
 */
export function parseModels(
  raw: string | undefined,
  deployed: boolean,
): string[] {
  const named = (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  const chain = named.length > 0 ? named : deployed ? USER_MODELS : TEST_MODELS;
  return [...new Set(chain)].slice(0, MAX_MODELS);
}
