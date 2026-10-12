// Commands that code executes itself, never the model (ADR-040): linking and
// unlinking decide who a phone may act as.

export type Command =
  /**
   * `code` is what followed LINK, as typed; the link code checks it. `bare`:
   * six digits sent on their own, which only a phone that is not linked
   * means as a code ("10 20 30" from a linked phone is something else).
   */
  | { type: "link"; code: string; bare: boolean }
  | { type: "stop" }
  | { type: "none" };

// LINK, then only what a code is typed with: digits, spaces, dashes, and an
// optional "code". "Link my chase account" is not a link attempt.
const LINK = /^\s*link\b[\s:#-]*(?:code\b[\s:#-]*)?([\d\s-]*?)[\s.!]*$/i;
// A link code on its own: six digits, with optional spaces or dashes.
const BARE_CODE = /^\s*((?:\d[\s-]*){6})[.!]*\s*$/;
const STOP = /^\s*(?:stop|unlink|unsubscribe)[\s.!]*$/i;

export function parseCommand(text: string): Command {
  if (STOP.test(text)) return { type: "stop" };

  const link = LINK.exec(text);
  if (link) return { type: "link", code: link[1]!.trim(), bare: false };
  const bare = BARE_CODE.exec(text);
  if (bare) return { type: "link", code: bare[1]!.trim(), bare: true };

  return { type: "none" };
}
