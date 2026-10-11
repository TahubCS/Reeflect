// The one file that imports Google's SDK (ARCH-07). It runs on the server
// and in `scripts/ai-check.ts`; it does not import `server-only` because
// plain Node scripts cannot load that package.
import { GoogleGenAI } from "@google/genai";
import type { Transport } from "./chain";

/**
 * Replies are a few sentences, but the model's own thinking counts toward
 * this limit too: a low limit cut replies off mid-sentence.
 */
const MAX_OUTPUT_TOKENS = 2_000;

/**
 * Calls Gemini's Interactions API once per request. Nothing is kept at
 * Google (`store: false`), and the SDK's own retries are off: moving to the
 * next model is the chain's job.
 */
export function googleTransport(apiKey: string): Transport {
  const client = new GoogleGenAI({ apiKey });

  return async ({ model, system, user, timeoutMs }) => {
    const interaction = await client.interactions.create(
      {
        model,
        input: user,
        system_instruction: system,
        store: false,
        generation_config: {
          // The lowest level every model in the chain accepts: the
          // newest ones refuse "minimal" (checked with `pnpm ai:check`).
          thinking_level: "low",
          max_output_tokens: MAX_OUTPUT_TOKENS,
        },
      },
      { timeout: timeoutMs, maxRetries: 0 },
    );
    // "incomplete" means the reply was cut short; half a sentence must not
    // reach a person, so it counts as a failure and the next model is tried.
    if (interaction.status !== "completed") {
      throw new Error(`interaction ${interaction.status ?? "unknown"}`);
    }
    return interaction.output_text ?? "";
  };
}
