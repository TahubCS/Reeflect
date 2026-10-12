import {
  type TurnRequestInput,
  turnRequestSchema,
  turnResponseSchema,
} from "@reeflect/agent-protocol";

/** What the person sees when the app cannot be reached or answers badly. */
export const FALLBACK_REPLY =
  "Something went wrong on our side. Please try again in a minute.";

/**
 * What the person sees when the app is too slow to answer. The app may
 * still finish, and a log may already be saved, so this does not say "try
 * again": sending it again could log the same spending twice.
 */
export const SLOW_REPLY =
  "That's taking longer than usual. If you logged spending, check the app before sending it again; UNDO removes the last one.";

export const TURN_TIMEOUT_MS = 20_000;

export type RelayOptions = {
  /** The app's origin. */
  readonly appUrl: string;
  readonly serviceToken: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
};

/** Why a turn got no real answer. Never contains the text or the handle. */
function logFailure(messageId: string, reason: string): void {
  console.error("relay: turn failed", { messageId, reason });
}

/**
 * Posts one turn to the app and returns the reply to send. Never throws:
 * any failure (a turn the app would reject, no connection, a slow or broken
 * answer) is logged by message id and becomes the fallback reply.
 */
export async function relayTurn(
  turn: TurnRequestInput,
  options: RelayOptions,
): Promise<string> {
  const { messageId } = turn;
  // Longer texts than the app accepts are cut, not dropped.
  const request = turnRequestSchema.safeParse({
    ...turn,
    text: turn.text.slice(0, 4000),
  });
  if (!request.success) {
    logFailure(messageId, "turn does not match the protocol");
    return FALLBACK_REPLY;
  }

  try {
    const response = await (options.fetch ?? fetch)(
      new URL("/api/agent/turn", options.appUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.serviceToken}`,
        },
        body: JSON.stringify(request.data),
        signal: AbortSignal.timeout(options.timeoutMs ?? TURN_TIMEOUT_MS),
        // A redirect would drop the token (or carry it somewhere else).
        // Fail loudly instead, so a wrong REEFLECT_URL shows in the log.
        redirect: "error",
      },
    );
    if (!response.ok) {
      logFailure(messageId, `app answered ${response.status}`);
      return FALLBACK_REPLY;
    }
    const body = turnResponseSchema.safeParse(await response.json());
    if (!body.success) {
      logFailure(messageId, "reply does not match the protocol");
      return FALLBACK_REPLY;
    }
    return body.data.reply;
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown";
    logFailure(messageId, reason);
    return reason === "TimeoutError" ? SLOW_REPLY : FALLBACK_REPLY;
  }
}
