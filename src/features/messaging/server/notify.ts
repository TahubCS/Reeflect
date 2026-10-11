import "server-only";
import { env } from "@/lib/env";
import type { Platform } from "./link";

// Texts the app starts, sent through the agent worker's `POST /send`
// (ADR-032). The worker holds the connection; the app decides the words.

export const SEND_TIMEOUT_MS = 5000;

export type SendOptions = {
  /** The worker's origin. Unset: nothing is sent. */
  readonly workerUrl?: string | undefined;
  readonly serviceToken?: string | undefined;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
};

/** Why a text was not sent. Never the conversation or the text. */
function logFailure(reason: string): void {
  console.error("notify: text not sent", { reason });
}

/**
 * Asks the worker to send `text` into a conversation. True when the worker
 * says it was sent. Never throws: what the user did on the website must
 * hold whether or not the text goes out.
 */
export async function sendToPhone(
  platform: Platform,
  spaceId: string,
  text: string,
  options: SendOptions = {
    workerUrl: env.AGENT_WORKER_URL,
    serviceToken: env.AGENT_SERVICE_TOKEN,
  },
): Promise<boolean> {
  const { workerUrl, serviceToken } = options;
  if (!workerUrl || !serviceToken) return false;

  try {
    const response = await (options.fetch ?? fetch)(
      new URL("/send", workerUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${serviceToken}`,
        },
        body: JSON.stringify({ platform, spaceId, text }),
        signal: AbortSignal.timeout(options.timeoutMs ?? SEND_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      logFailure(`worker answered ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    logFailure(error instanceof Error ? error.name : "unknown");
    return false;
  }
}
