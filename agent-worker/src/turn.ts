import {
  MAX_PHOTO_BYTES,
  PHOTO_MIME_TYPES,
  PLATFORMS,
  type PhotoMimeType,
  type Platform,
  type TurnPhoto,
  type TurnRequest,
} from "@reeflect/agent-protocol";

// Decides which incoming messages are forwarded to the app, and in what
// shape. This is the only judgement the worker makes (ADR-032): everything
// about what a message means is the app's business. For a picture that is
// only what can be carried: one picture, of a type and size the turn allows
// (ADR-067). The app writes every reply.

/** The parts of a Spectrum content value this file reads. */
export type IncomingContent = {
  readonly type: string;
  readonly text?: unknown;
  /** An attachment's type, size in bytes, and how to download it. */
  readonly mimeType?: unknown;
  readonly size?: unknown;
  readonly read?: unknown;
  /** A group's parts, each a message: a picture and its caption. */
  readonly items?: unknown;
  /** What a threaded reply holds. */
  readonly content?: unknown;
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
  /** iMessage spaces say whether they are a direct chat or a group. */
  readonly type?: unknown;
};

/** A picture that can be forwarded once it is downloaded. */
export type PhotoSource = {
  readonly mimeType: PhotoMimeType;
  readonly read: () => Promise<Uint8Array>;
};

type NotForwarded = Exclude<TurnPhoto, { status: "attached" }>;

/** What a message carries: its words, and at most one picture. */
type Parts = { text: string; photo?: NotForwarded | PhotoSource };

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

const isContent = (value: unknown): value is IncomingContent =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof value.type === "string";

/** "image/jpeg" from "IMAGE/JPEG; charset=binary". */
const plainType = (mimeType: string) =>
  (mimeType.split(";")[0] ?? "").trim().toLowerCase();

const isPhotoType = (mimeType: string): mimeType is PhotoMimeType =>
  (PHOTO_MIME_TYPES as readonly string[]).includes(mimeType);

/** Whether one picture can be carried, and why not when it cannot. */
function photoOf(content: IncomingContent): NotForwarded | PhotoSource {
  const mimeType = plainType(String(content.mimeType));
  if (!isPhotoType(mimeType)) return { status: "unsupported" };
  // Known to be too large before a byte is downloaded.
  if (typeof content.size === "number" && content.size > MAX_PHOTO_BYTES) {
    return { status: "too_large" };
  }
  const { read } = content;
  if (typeof read !== "function") return { status: "unavailable" };
  return { mimeType, read: () => read.call(content) as Promise<Uint8Array> };
}

const isAttachment = (content: IncomingContent) =>
  content.type === "attachment" && typeof content.mimeType === "string";

function partsOf(content: IncomingContent): Parts | null {
  if (content.type === "text") {
    return typeof content.text === "string" ? { text: content.text } : null;
  }
  if (isAttachment(content)) return { text: "", photo: photoOf(content) };
  if (content.type !== "group" || !Array.isArray(content.items)) return null;

  // A picture with a caption, or several pictures, is one message in parts.
  const parts = (content.items as unknown[]).flatMap((item) =>
    typeof item === "object" &&
    item !== null &&
    "content" in item &&
    isContent(item.content)
      ? [item.content]
      : [],
  );
  const text = parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join(" ");
  const attachments = parts.filter(isAttachment);
  if (attachments.length === 0) return text === "" ? null : { text };

  const pictures = attachments.filter((part) =>
    plainType(String(part.mimeType)).startsWith("image/"),
  );
  if (pictures.length > 1) return { text, photo: { status: "several" } };
  if (pictures.length === 0) return { text, photo: { status: "unsupported" } };
  return { text, photo: photoOf(pictures[0]!) };
}

/** What the message holds, looking inside a threaded reply. */
function read(message: IncomingMessage): Parts | null {
  const { content } = message;
  // A reply sent in a thread wraps what was said: "yes" swiped onto a
  // question is still "yes".
  const said =
    content.type === "reply" && isContent(content.content)
      ? content.content
      : content;
  return partsOf(said);
}

const isSource = (photo: Parts["photo"]): photo is PhotoSource =>
  photo !== undefined && "read" in photo;

/**
 * The turn to send the app for this message, or null when the worker should
 * stay silent: its own messages, group chats (the agent works in direct
 * chats only, ADR-034), platforms the app does not know, and anything that
 * is neither words nor a file. A picture that can be carried is not in the
 * turn yet: `photoToLoad` gives it, to download and add.
 */
export function toTurn(
  space: IncomingSpace,
  message: IncomingMessage,
): TurnRequest | null {
  if (message.direction !== "inbound") return null;
  if (!isPlatform(message.platform)) return null;
  if (space.type === "group") return null;
  if (message.sender === undefined) return null;

  const parts = read(message);
  if (parts === null) return null;

  return {
    platform: message.platform,
    handle: message.sender.id,
    spaceId: space.id,
    messageId: message.id,
    text: parts.text,
    ...(parts.photo === undefined || isSource(parts.photo)
      ? {}
      : { photo: parts.photo }),
  };
}

/** The one picture in this message that is still to be downloaded, or null. */
export function photoToLoad(message: IncomingMessage): PhotoSource | null {
  const photo = read(message)?.photo;
  return isSource(photo) ? photo : null;
}
