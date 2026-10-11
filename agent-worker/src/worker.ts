import { createKeyedQueue } from "./queue.ts";
import { type RelayOptions, relayTurn } from "./relay.ts";
import { loadPhoto } from "./photo.ts";
import {
  type IncomingMessage,
  type IncomingSpace,
  photoToLoad,
  toTurn,
} from "./turn.ts";

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
 * The whole worker (ADR-032): for each text or photo someone sends in a
 * direct chat, show the typing indicator, ask the app what to say, and send
 * it. Runs until the message stream ends. One conversation is answered in
 * order; different conversations do not wait on each other.
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
    const { messageId } = turn;
    const picture = photoToLoad(message);

    const answered = enqueue(space.id, async () => {
      // The indicator is a nicety: a platform that refuses it must not
      // cost the person their answer.
      await space.startTyping().catch((error: unknown) => {
        console.error("worker: typing indicator refused", {
          messageId,
          ...failure(error),
        });
      });
      try {
        // A picture is downloaded here, in the conversation's turn, and
        // handed on in the same request (ADR-067). The app decides what to
        // say about it, including when it could not be carried.
        const photo = picture === null ? turn.photo : await loadPhoto(picture);
        if (photo !== undefined && photo.status !== "attached") {
          // Ids only: never the handle, the caption or the bytes.
          console.error("worker: photo not forwarded", {
            messageId,
            status: photo.status,
          });
        }
        const forwarded = photo === undefined ? turn : { ...turn, photo };
        await space.send(await relayTurn(forwarded, relay));
      } catch (error) {
        // Ids only: never the handle or the text.
        console.error("worker: reply not sent", {
          messageId,
          ...failure(error),
        });
      } finally {
        await space.stopTyping().catch(() => {});
      }
    });
    pending.add(answered);
    void answered.then(() => pending.delete(answered));
  }

  // The stream has ended (shutdown): let replies in flight finish.
  await Promise.all(pending);
}
