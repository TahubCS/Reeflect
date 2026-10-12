import { z } from "zod";

// What the agent worker sends the app for each inbound message, what the
// app answers, and what the app asks the worker to send (ADR-032, ARCH-13).
// Both sides validate with these, so a change here is a change to the
// contract between them.

/** `terminal` is Spectrum's development chat; the app refuses it when deployed. */
export const PLATFORMS = ["imessage", "terminal"] as const;

export type Platform = (typeof PLATFORMS)[number];

/**
 * What the person sent (ADR-066). `text` is read; the others are answered
 * with a fixed reply, so nothing someone sends is met with silence: `edit`
 * (a text changed after it was sent), `attachment` (a photo or file),
 * `voice` (a voice note).
 */
export const MESSAGE_KINDS = ["text", "edit", "attachment", "voice"] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** `direct` is a one-to-one chat; the agent answers nothing else (ADR-034). */
export const SPACE_TYPES = ["direct", "group"] as const;

export const turnRequestSchema = z.object({
  platform: z.enum(PLATFORMS),
  /** The sender's phone number or address, as the platform reports it. */
  handle: z.string().trim().min(1).max(320),
  spaceId: z.string().min(1).max(200),
  messageId: z.string().min(1).max(200),
  text: z.string().max(4000),
  kind: z.enum(MESSAGE_KINDS).default("text"),
  /** Omitted by an older worker; the app treats a missing type as direct. */
  spaceType: z.enum(SPACE_TYPES).optional(),
});

/** What the app reads, after defaults. */
export type TurnRequest = z.infer<typeof turnRequestSchema>;
/** What a worker may send: `kind` can be left out for plain text. */
export type TurnRequestInput = z.input<typeof turnRequestSchema>;

export const turnResponseSchema = z.object({
  reply: z.string().min(1),
});

export type TurnResponse = z.infer<typeof turnResponseSchema>;

/**
 * What the app sends the worker's `POST /send` to text a conversation that
 * did not just write in (ADR-032). The worker sends `text` as it is.
 */
export const sendRequestSchema = z.object({
  platform: z.enum(PLATFORMS),
  spaceId: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(1000),
});

export type SendRequest = z.infer<typeof sendRequestSchema>;
