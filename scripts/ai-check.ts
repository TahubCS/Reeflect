// `pnpm ai:check`: asks every model in the agent's chain one small question
// with the real key from .env.local, and says which ones answer (ADR-059).
// It prints model names and outcomes only: never the key, never a reply's
// figures (there are none: the question uses a label, like the agent does).
import { hasOwnDigits } from "@/lib/ai/digitScan";
import { fill } from "@/lib/ai/fill";
import { googleTransport } from "@/lib/ai/google";
import { parseModels } from "@/lib/ai/models";
import type { Transport } from "@/lib/ai/chain";

const SYSTEM =
  "Reply with one short sentence. Never write a digit. State the amount only by writing the label {cash_total} exactly, braces included.";
const USER = "How much do I have? Label you may use: {cash_total}.";
const TIMEOUT_MS = 15_000;

export type ModelCheck = { model: string; result: string; ok: boolean };

/** What one model did with the test question, in a few words. */
export async function checkModel(
  transport: Transport,
  model: string,
): Promise<ModelCheck> {
  try {
    const draft = await transport({
      model,
      system: SYSTEM,
      user: USER,
      timeoutMs: TIMEOUT_MS,
    });
    if (draft.trim() === "") return { model, result: "no text", ok: false };
    const followed =
      !hasOwnDigits(draft) && fill(draft, { cash_total: "$0.00" }).ok;
    return {
      model,
      result: followed
        ? "answered, followed the label rule"
        : "answered, but broke the label rule",
      ok: true,
    };
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : undefined;
    const result =
      status === 429
        ? "out of quota or rate-limited (429)"
        : status === 404
          ? "no such model (404): remove it from the chain"
          : status === 401 || status === 403
            ? `key not accepted (${status})`
            : `failed (${typeof status === "number" ? status : error instanceof Error ? error.name : "unknown"})`;
    return { model, result, ok: false };
  }
}

export function formatChecks(checks: readonly ModelCheck[]): string[] {
  const width = Math.max(...checks.map((check) => check.model.length));
  return checks.map(
    (check) =>
      `${check.ok ? "ok  " : "FAIL"}  ${check.model.padEnd(width)}  ${check.result}`,
  );
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: only variables already set are used.
  }
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    console.error("GEMINI_API_KEY is not set (.env.local).");
    process.exitCode = 1;
    return;
  }
  const transport = googleTransport(key);
  const checks: ModelCheck[] = [];
  // One at a time, so a per-minute limit on the key is not what fails them.
  for (const model of parseModels(process.env.GEMINI_MODELS)) {
    checks.push(await checkModel(transport, model));
  }
  for (const line of formatChecks(checks)) console.log(line);
  if (!checks.some((check) => check.ok)) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("ai-check.ts")) await main();
