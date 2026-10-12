import {
  type MessageKind,
  PLATFORMS,
  type Platform,
  type TurnRequestInput,
} from "@reeflect/agent-protocol";

// Decides which incoming messages are forwarded to the app, and in what
// shape. This is the only judgement the worker makes (ADR-032): everything
// about what a message means, and every word of every reply, is the app's
// business.

/** The parts of Spectrum content this file reads. */
export type IncomingContent = {
  readonly type: string;
  readonly text?: unknown;
  readonly markdown?: unknown;
  /** What a `reply`, `edit` or `effect` wraps. */
  readonly content?: unknown;
  /** A `group`: a photo sent with a caption, for example. */
  readonly items?: unknown;
};

/** The parts of a Spectrum message and space this file reads. */
export type IncomingMessage = {
  readonly id: string;
  readonly platform: string;
  readonly direction: "inbound" | "outbound";
  readonly content: IncomingContent;
  readonly sender: { readonly id: string } | undefined;
};

export type IncomingSpace = {
  readonly id: string;
  /**
   * iMessage spaces say `dm` or `group`; the development terminal says
   * nothing. Anything else is treated as a group.
   */
  readonly type?: unknown;
};

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

const isContent = (value: unknown): value is IncomingContent =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

/** Plain words in a piece of content, or null when it has none. */
function wordsOf(content: IncomingContent): string | null {
  if (content.type === "text" && typeof content.text === "string") {
    return content.text;
  }
  if (content.type === "markdown" && typeof content.markdown === "string") {
    return content.markdown;
  }
  return null;
}

/**
 * What a message is, for the app: its kind and its words. A swipe reply
 * and a text sent with an effect are read as the text inside them (they
 * were silently dropped before, HO-074). Null for what gets no answer at
 * all: tapbacks, typing, read receipts and the like.
 */
export function readContent(
  content: IncomingContent,
): { kind: MessageKind; text: string } | null {
  const words = wordsOf(content);
  if (words !== null) return { kind: "text", text: words };

  switch (content.type) {
    case "reply":
    case "effect":
      return isContent(content.content) ? readContent(content.content) : null;
    case "edit": {
      const inner = isContent(content.content)
        ? wordsOf(content.content)
        : null;
      return { kind: "edit", text: inner ?? "" };
    }
    case "attachment":
      return { kind: "attachment", text: "" };
    case "voice":
      return { kind: "voice", text: "" };
    case "group": {
      // A photo with a caption: the caption is kept, so the app can say
      // what it can and cannot read.
      const items = Array.isArray(content.items) ? content.items : [];
      const caption = items
        .map((item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          isContent((item as { content?: unknown }).content)
            ? wordsOf((item as { content: IncomingContent }).content)
            : null,
        )
        .find((text): text is string => text !== null);
      return { kind: "attachment", text: caption ?? "" };
    }
    default:
      return null;
  }
}

/**
 * The turn to send the app for this message, or null when the worker should
 * stay silent: its own messages, group chats (the agent works in direct
 * chats only, ADR-034), platforms the app does not know, and content that
 * needs no answer (`readContent`).
 */
export function toTurn(
  space: IncomingSpace,
  message: IncomingMessage,
): TurnRequestInput | null {
  if (message.direction !== "inbound") return null;
  if (!isPlatform(message.platform)) return null;
  // An allow-list: only a chat known to be one-to-one is answered.
  if (space.type !== undefined && space.type !== "dm") return null;
  if (message.sender === undefined) return null;

  const read = readContent(message.content);
  if (read === null) return null;

  return {
    platform: message.platform,
    handle: message.sender.id,
    spaceId: space.id,
    messageId: message.id,
    text: read.text,
    kind: read.kind,
    spaceType: "direct",
  };
}
