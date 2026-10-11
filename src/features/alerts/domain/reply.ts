// Replies to a proactive text, read by code (ADR-040, ADR-105). Only a
// whole message counts: "keep" alone is a reply, "keep track of lunch" is
// not.

export type AlertReply =
  | { type: "keep" }
  | { type: "cancel" }
  | { type: "ignore" }
  | { type: "details" }
  | { type: "none" };

const WORDS: Record<string, AlertReply["type"]> = {
  keep: "keep",
  "keep it": "keep",
  cancel: "cancel",
  "cancel it": "cancel",
  ignore: "ignore",
  "not mine": "ignore",
  "not a subscription": "ignore",
  details: "details",
  detail: "details",
};

export function parseAlertReply(text: string): AlertReply {
  const words = text
    .toLowerCase()
    .replace(/[.!?,'"’]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const type = WORDS[words];
  return type ? { type } : { type: "none" };
}
