import {
  PLATFORMS,
  type Platform,
  type TurnRequest,
} from "@reeflect/agent-protocol";

// Decides which incoming messages are forwarded to the app, and in what
// shape. This is the only judgement the worker makes (ADR-032): everything
// about what a message means is the app's business.

/** The parts of a Spectrum message and space this file reads. */
export type IncomingMessage = {
  readonly id: string;
  readonly platform: string;
  readonly direction: "inbound" | "outbound";
  readonly content: { readonly type: string; readonly text?: unknown };
  readonly sender: { readonly id: string } | undefined;
};

export type IncomingSpace = {
  readonly id: string;
  /** iMessage spaces say whether they are a direct chat or a group. */
  readonly type?: unknown;
};

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/**
 * The turn to send the app for this message, or null when the worker should
 * stay silent: its own messages, anything that is not plain text, group
 * chats (the agent works in direct chats only, ADR-034) and platforms the
 * app does not know.
 */
export function toTurn(
  space: IncomingSpace,
  message: IncomingMessage,
): TurnRequest | null {
  if (message.direction !== "inbound") return null;
  if (!isPlatform(message.platform)) return null;
  if (space.type === "group") return null;
  if (message.sender === undefined) return null;

  const { content } = message;
  if (content.type !== "text" || typeof content.text !== "string") return null;

  return {
    platform: message.platform,
    handle: message.sender.id,
    spaceId: space.id,
    messageId: message.id,
    text: content.text,
  };
}
