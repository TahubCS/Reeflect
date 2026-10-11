// Tries each model in turn until one answers (ADR-059). Pure: the call to
// Google is passed in, so tests and `scripts/ai-check.ts` can use it too.

export type AiRequest = {
  /** The standing instruction: voice, limits, rules. */
  system: string;
  /** This turn's input. */
  user: string;
  /** A picture sent with the input, as base64 (F-29, ADR-067). */
  image?: { mimeType: string; data: string };
  /** A JSON schema the answer must follow; the answer is then JSON text. */
  schema?: Record<string, unknown>;
};

/** One call to one model. Rejects with an error that may carry `status`. */
export type Transport = (
  request: AiRequest & { model: string; timeoutMs: number },
) => Promise<string>;

export type Attempt = {
  model: string;
  outcome: "answered" | "empty" | "failed" | "cooling_off" | "out_of_time";
  /** The HTTP status when the model's API refused the call. */
  status?: number;
};

/** No model produced text. `attempts` says what happened to each. */
export class AiUnavailableError extends Error {
  readonly attempts: readonly Attempt[];

  constructor(attempts: readonly Attempt[]) {
    super("no model answered");
    this.name = "AiUnavailableError";
    this.attempts = attempts;
  }
}

export type ChainOptions = {
  transport: Transport;
  models: readonly string[];
  /** Longest wait for one model. */
  attemptTimeoutMs?: number;
  /** Longest wait across the whole chain. */
  totalBudgetMs?: number;
  now?: () => number;
};

// Sized so that two overloaded models at the front of the chain still
// leave time for a third to answer, inside the worker's 20-second wait.
export const ATTEMPT_TIMEOUT_MS = 4_000;
export const TOTAL_BUDGET_MS = 14_000;
/** Reading a picture takes longer than writing a sentence (ADR-067). */
export const IMAGE_ATTEMPT_TIMEOUT_MS = 8_000;
/** So does writing a paragraph and suggestions to a shape (F-15). */
export const LONG_ATTEMPT_TIMEOUT_MS = IMAGE_ATTEMPT_TIMEOUT_MS;
/**
 * A model that failed (rate or quota limit, overload, timeout) is left alone
 * this long, so the texts that follow do not each wait on it again.
 */
export const FAILURE_COOL_OFF_MS = 5 * 60_000;
/** A model name the API does not know is not worth asking again soon. */
export const UNKNOWN_MODEL_COOL_OFF_MS = 60 * 60_000;

const statusOf = (error: unknown): number | undefined =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  typeof error.status === "number"
    ? error.status
    : undefined;

/**
 * Returns `generate`, which asks the models in order and resolves with the
 * first non-empty answer. A model that fails is skipped for the rest of
 * this call, and for later calls while it cools off: a minute after most
 * failures, an hour after an unknown name (404). That memory lives in this
 * instance only, so it is best-effort across server instances.
 */
export function createChain(options: ChainOptions) {
  const {
    transport,
    models,
    attemptTimeoutMs = ATTEMPT_TIMEOUT_MS,
    totalBudgetMs = TOTAL_BUDGET_MS,
    now = Date.now,
  } = options;
  const coolUntil = new Map<string, number>();

  return async function generate(
    request: AiRequest,
  ): Promise<{ text: string; model: string; attempts: Attempt[] }> {
    const deadline = now() + totalBudgetMs;
    const attempts: Attempt[] = [];

    for (const model of models) {
      if ((coolUntil.get(model) ?? 0) > now()) {
        attempts.push({ model, outcome: "cooling_off" });
        continue;
      }
      const remaining = deadline - now();
      if (remaining <= 0) {
        attempts.push({ model, outcome: "out_of_time" });
        continue;
      }
      try {
        const text = (
          await transport({
            ...request,
            model,
            timeoutMs: Math.min(attemptTimeoutMs, remaining),
          })
        ).trim();
        if (text !== "") {
          attempts.push({ model, outcome: "answered" });
          return { text, model, attempts };
        }
        attempts.push({ model, outcome: "empty" });
      } catch (error) {
        const status = statusOf(error);
        coolUntil.set(
          model,
          now() +
            (status === 404 ? UNKNOWN_MODEL_COOL_OFF_MS : FAILURE_COOL_OFF_MS),
        );
        attempts.push({ model, outcome: "failed", status });
      }
    }
    throw new AiUnavailableError(attempts);
  };
}
