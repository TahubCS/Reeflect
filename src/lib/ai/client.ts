import "server-only";
import { env } from "@/lib/env";
import {
  type AiRequest,
  AiUnavailableError,
  type Attempt,
  IMAGE_ATTEMPT_TIMEOUT_MS,
  LONG_ATTEMPT_TIMEOUT_MS,
  createChain,
} from "./chain";
import { googleTransport } from "./google";
import { parseModels } from "./models";

export { AiUnavailableError, type AiRequest } from "./chain";

// Built once per server instance, so a model that hit its limit stays
// skipped between requests. Without a key there is no chain, and every call
// reports "unavailable": callers then use their code-built reply.
const transport =
  env.GEMINI_API_KEY === undefined ? null : googleTransport(env.GEMINI_API_KEY);
// Users' models on the deployed app, the test model anywhere else.
const models = parseModels(env.GEMINI_MODELS, env.VERCEL !== undefined);
const chain = transport === null ? null : createChain({ transport, models });
// The same models with a longer wait each, inside the same total (ADR-067).
const imageChain =
  transport === null
    ? null
    : createChain({
        transport,
        models,
        attemptTimeoutMs: IMAGE_ATTEMPT_TIMEOUT_MS,
      });

// And for a longer piece of writing: the website's summary panel (F-15).
const longChain =
  transport === null
    ? null
    : createChain({
        transport,
        models,
        attemptTimeoutMs: LONG_ATTEMPT_TIMEOUT_MS,
      });

/** Model names and outcomes only: never the prompt, the reply or the key. */
function logSkipped(attempts: readonly Attempt[]): void {
  const skipped = attempts.filter((attempt) => attempt.outcome !== "answered");
  if (skipped.length > 0) console.warn("ai: models skipped", { skipped });
}

/**
 * Text from the first model in the chain that answers (ADR-059). Rejects
 * with `AiUnavailableError` when none does, or when no key is set.
 */
export async function generateText(request: AiRequest): Promise<string> {
  return run(chain, request);
}

/**
 * The same for a request that carries a picture: each model is given
 * longer, since reading an image is slower than writing a sentence.
 */
export async function generateFromImage(request: AiRequest): Promise<string> {
  return run(imageChain, request);
}

/**
 * The same for a paragraph or more: each model is given longer, since a
 * few sentences to a shape take longer to write than a text reply.
 */
export async function generateLongText(request: AiRequest): Promise<string> {
  return run(longChain, request);
}

async function run(
  generate: typeof chain,
  request: AiRequest,
): Promise<string> {
  if (generate === null) throw new AiUnavailableError([]);
  try {
    const { text, attempts } = await generate(request);
    logSkipped(attempts);
    return text;
  } catch (error) {
    if (error instanceof AiUnavailableError) logSkipped(error.attempts);
    throw error;
  }
}
