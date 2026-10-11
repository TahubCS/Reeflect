// Commands that code executes itself, never the model (ADR-040): linking and
// unlinking decide who a phone may act as.

export type Command =
  /** `code` is what followed LINK, as typed; the link code checks it. */
  { type: "link"; code: string } | { type: "stop" } | { type: "none" };

const LINK = /^\s*link\b[\s:#-]*([\s\S]*?)[\s.!]*$/i;
// A link code on its own: six digits, with optional spaces or dashes.
const BARE_CODE = /^\s*((?:\d[\s-]*){6})[.!]*\s*$/;
const STOP = /^\s*(?:stop|unlink|unsubscribe)[\s.!]*$/i;

export function parseCommand(text: string): Command {
  if (STOP.test(text)) return { type: "stop" };

  const link = LINK.exec(text) ?? BARE_CODE.exec(text);
  if (link) return { type: "link", code: link[1]!.trim() };

  return { type: "none" };
}
