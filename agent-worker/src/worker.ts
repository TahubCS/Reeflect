import { createKeyedQueue } from "./queue.ts";
import { type RelayOptions, relayTurn } from "./relay.ts";
import { type IncomingMessage, type IncomingSpace, toTurn } from "./turn.ts";

/** The parts of a Spectrum space the worker uses to answer. */
export type ReplySpace = IncomingSpace & {
  /** Runs `fn` with the typing indicator showing, where the platform has one. */
  responding<T>(fn: () => T | Promise<T>): Promise<T>;
  send(content: string): Promise<unknown>;
};

export type MessageSource = {
  readonly messages: AsyncIterable<readonly [ReplySpace, IncomingMessage]>;
};

/**
 * The whole worker (ADR-032): for each text someone sends in a direct chat,
 * show the typing indicator, ask the app what to say, and send it. Runs
 * until the message stream ends. One conversation is answered in order;
 * different conversations do not wait on each other.
 */
export async function runWorker(
  source: MessageSource,
  relay: RelayOptions,
): Promise<void> {
  const enqueue = createKeyedQueue();
  const pending = new Set<Promise<void>>();

  for await (const [space, message] of source.messages) {
    const turn = toTurn(space, message);
    if (turn === null) continue;

    const answered = enqueue(space.id, async () => {
      try {
        await space.responding(async () => {
          await space.send(await relayTurn(turn, relay));
        });
      } catch (error) {
        // Ids only: never the handle or the text.
        console.error("worker: reply not sent", {
          messageId: turn.messageId,
          reason: error instanceof Error ? error.name : "unknown",
        });
      }
    });
    pending.add(answered);
    void answered.then(() => pending.delete(answered));
  }

  // The stream has ended (shutdown): let replies in flight finish.
  await Promise.all(pending);
}
