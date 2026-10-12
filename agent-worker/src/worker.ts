import { createKeyedQueue } from "./queue.ts";
import { type RelayOptions, relayTurn } from "./relay.ts";
import { type IncomingMessage, type IncomingSpace, toTurn } from "./turn.ts";

/** The parts of a Spectrum space the worker uses to answer. */
export type ReplySpace = IncomingSpace & {
  /** Show and hide the typing indicator, where the platform has one. */
  startTyping(): Promise<unknown>;
  stopTyping(): Promise<unknown>;
  send(content: string): Promise<unknown>;
};

export type MessageSource = {
  readonly messages: AsyncIterable<readonly [ReplySpace, IncomingMessage]>;
};

/** How long one call to the platform may take before it is given up. */
export const PLATFORM_TIMEOUT_MS = 15_000;

/**
 * The platform call, or a TimeoutError after `ms`. A call that hangs
 * instead of failing would otherwise hold up every later text in that
 * conversation, since one conversation is answered in order.
 */
export function within<T>(call: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("platform call timed out");
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Why something failed, for the log: the error's name and, when the
 * platform gives one, its code (a fixed word such as `preconditionFailed`).
 * Never the message, which may hold a phone number.
 */
export function failure(error: unknown): { reason: string; code?: string } {
  const reason = error instanceof Error ? error.name : "unknown";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  return typeof code === "string" ? { reason, code } : { reason };
}

/**
 * The whole worker (ADR-032): for each text someone sends in a direct chat,
 * show the typing indicator, ask the app what to say, and send it. Runs
 * until the message stream ends. One conversation is answered in order;
 * different conversations do not wait on each other.
 */
export async function runWorker(
  source: MessageSource,
  relay: RelayOptions,
  platformTimeoutMs: number = PLATFORM_TIMEOUT_MS,
): Promise<void> {
  const enqueue = createKeyedQueue();
  const pending = new Set<Promise<void>>();

  for await (const [space, message] of source.messages) {
    const turn = toTurn(space, message);
    if (turn === null) continue;
    const { messageId } = turn;

    const answered = enqueue(space.id, async () => {
      // The indicator is a nicety: a platform that refuses it must not
      // cost the person their answer.
      await within(space.startTyping(), platformTimeoutMs).catch(
        (error: unknown) => {
          console.error("worker: typing indicator refused", {
            messageId,
            ...failure(error),
          });
        },
      );
      try {
        const reply = await relayTurn(turn, relay);
        await within(space.send(reply), platformTimeoutMs);
      } catch (error) {
        // Ids only: never the handle or the text.
        console.error("worker: reply not sent", {
          messageId,
          ...failure(error),
        });
      } finally {
        await within(space.stopTyping(), platformTimeoutMs).catch(() => {});
      }
    });
    pending.add(answered);
    void answered.then(() => pending.delete(answered));
  }

  // The stream has ended (shutdown): let replies in flight finish.
  await Promise.all(pending);
}
