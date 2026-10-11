// `pnpm ai:check`: asks each test model one small question with the real key
// from .env.local, and says which ones answer (ADR-059). `pnpm ai:check users`
// asks the models that answer real users instead: that spends their small
// daily allowance, so run it only when the chain itself is in doubt.
// It prints model names and outcomes only: never the key, never a reply's
// figures (there are none: the question uses a label, like the agent does).
// `pnpm ai:check receipt` sends each test model a made-up receipt photo from
// `tests/fixtures/receipts/` and says whether it read the printed total and
// how long it took (F-29, ADR-067). Never point it at a real receipt.
import { readFileSync } from "node:fs";
import { readReceipt, receiptRequest } from "@/features/agent/domain/receipt";
import { hasOwnDigits } from "@/lib/ai/digitScan";
import { fill } from "@/lib/ai/fill";
import { googleTransport } from "@/lib/ai/google";
import { USER_MODELS, parseModels } from "@/lib/ai/models";
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
    return { model, result: failed(error), ok: false };
  }
}

/** Why a call failed, in a few words: the status, never the message. */
function failed(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : undefined;
  return status === 429
    ? "out of quota or rate-limited (429)"
    : status === 404
      ? "no such model (404): remove it from the chain"
      : status === 401 || status === 403
        ? `key not accepted (${status})`
        : `failed (${typeof status === "number" ? status : error instanceof Error ? error.name : "unknown"})`;
}

/** A made-up receipt (TEST-08) and what is printed on it. */
const RECEIPT_FILE = "tests/fixtures/receipts/normal.png";
const RECEIPT_TOTAL_CENTS = 2340;
const RECEIPT_CATEGORIES = ["Groceries", "Eating out", "Transport"].map(
  (name) => ({ id: name, name }),
);

/**
 * What one model did with the made-up receipt photo (F-29, ADR-067): whether
 * it takes a picture, answers in the shape asked for, reads the printed
 * total, and how long that took.
 */
export async function checkReceiptModel(
  transport: Transport,
  model: string,
  image: { mimeType: string; data: string },
  now: () => number = Date.now,
): Promise<ModelCheck> {
  const started = now();
  try {
    const answer = await transport({
      model,
      ...receiptRequest(RECEIPT_CATEGORIES),
      image,
      timeoutMs: TIMEOUT_MS,
    });
    const took = `${now() - started} ms`;
    const read = readReceipt(answer, RECEIPT_CATEGORIES);
    if (read.type === "declined") {
      return {
        model,
        result: `answered, but not as a receipt: ${read.reason} (${took})`,
        ok: false,
      };
    }
    const right = read.amount === RECEIPT_TOTAL_CENTS;
    return {
      model,
      result: `${right ? "read the total" : "read a WRONG total"}, category ${read.category?.name ?? "none"} (${took})`,
      ok: right,
    };
  } catch (error) {
    return { model, result: failed(error), ok: false };
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
  const forUsers = process.argv[2] === "users";
  const receipt = process.argv[2] === "receipt";
  const models = forUsers
    ? [...USER_MODELS]
    : parseModels(process.env.GEMINI_MODELS, false);
  console.log(
    forUsers
      ? "Checking the models that answer users (this uses their daily allowance):"
      : receipt
        ? "Checking that the test models read a made-up receipt photo:"
        : "Checking the test models (`pnpm ai:check users` checks the users' models):",
  );
  const transport = googleTransport(key);
  const image = receipt
    ? { mimeType: "image/png", data: readFileSync(RECEIPT_FILE, "base64") }
    : null;
  const checks: ModelCheck[] = [];
  // One at a time, so a per-minute limit on the key is not what fails them.
  for (const model of models) {
    checks.push(
      image === null
        ? await checkModel(transport, model)
        : await checkReceiptModel(transport, model, image),
    );
  }
  for (const line of formatChecks(checks)) console.log(line);
  if (!checks.some((check) => check.ok)) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("ai-check.ts")) await main();
