import { MAX_PHOTO_BYTES, type TurnPhoto } from "@reeflect/agent-protocol";
import type { PhotoSource } from "./turn.ts";

// Downloads the one picture a message carries so it can travel in the turn
// (ADR-067). The bytes are held in memory only for as long as that takes:
// never written to disk, never logged.

/** How long the platform has to hand the picture over. */
export const PHOTO_TIMEOUT_MS = 10_000;

/**
 * The picture as the turn carries it, or why it cannot be carried. Never
 * throws: a download that fails or takes too long is `unavailable`, and one
 * that turns out larger than the turn allows is `too_large`.
 */
export async function loadPhoto(
  source: PhotoSource,
  timeoutMs: number = PHOTO_TIMEOUT_MS,
): Promise<TurnPhoto> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const bytes = await Promise.race([
      source.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      return { status: "unavailable" };
    }
    if (bytes.length > MAX_PHOTO_BYTES) return { status: "too_large" };
    return {
      status: "attached",
      mimeType: source.mimeType,
      data: Buffer.from(bytes).toString("base64"),
    };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
