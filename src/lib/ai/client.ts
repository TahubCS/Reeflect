import "server-only";
import { env } from "@/lib/env";
import {
  type AiRequest,
  AiUnavailableError,
  type Attempt,
  createChain,
} from "./chain";
import { googleTransport } from "./google";
import { parseModels } from "./models";

export { AiUnavailableError, type AiRequest } from "./chain";

// Built once per server instance, so a model that hit its limit stays
// skipped between requests. Without a key there is no chain, and every call
// reports "unavailable": callers then use their code-built reply.
const chain =
  env.GEMINI_API_KEY === undefined
    ? null
    : createChain({
        transport: googleTransport(env.GEMINI_API_KEY),
        // Users' models on the deployed app, the test model anywhere else.
        models: parseModels(env.GEMINI_MODELS, env.VERCEL !== undefined),
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
  if (chain === null) throw new AiUnavailableError([]);
  try {
    const { text, attempts } = await chain(request);
    logSkipped(attempts);
    return text;
  } catch (error) {
    if (error instanceof AiUnavailableError) logSkipped(error.attempts);
    throw error;
  }
}
