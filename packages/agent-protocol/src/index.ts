import { z } from "zod";

// What the agent worker sends the app for each inbound message, what the
// app answers, and what the app asks the worker to send (ADR-032, ARCH-13).
// Both sides validate with these, so a change here is a change to the
// contract between them.

/** `terminal` is Spectrum's development chat; the app refuses it when deployed. */
export const PLATFORMS = ["imessage", "terminal"] as const;

export type Platform = (typeof PLATFORMS)[number];

/** The picture types the app reads (ADR-067); Gemini accepts all five. */
export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
] as const;

export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number];

/**
 * The largest picture the worker forwards. As base64 inside the turn it is
 * 4,000,000 characters, which leaves room under the 4.5 MB a request to the
 * app's host may carry.
 */
export const MAX_PHOTO_BYTES = 3_000_000;
const MAX_PHOTO_BASE64_LENGTH = (MAX_PHOTO_BYTES / 3) * 4;

/**
 * A picture that came with the message (F-29, ADR-067): its bytes, or why
 * the worker could not forward them. The app writes the reply either way.
 * `several`: more than one picture in the message. `unavailable`: it could
 * not be downloaded from the platform.
 */
export const turnPhotoSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("attached"),
    mimeType: z.enum(PHOTO_MIME_TYPES),
    data: z.base64().min(1).max(MAX_PHOTO_BASE64_LENGTH),
  }),
  z.object({
    status: z.enum(["too_large", "unsupported", "several", "unavailable"]),
  }),
]);

export type TurnPhoto = z.infer<typeof turnPhotoSchema>;

export const turnRequestSchema = z.object({
  platform: z.enum(PLATFORMS),
  /** The sender's phone number or address, as the platform reports it. */
  handle: z.string().trim().min(1).max(320),
  spaceId: z.string().min(1).max(200),
  messageId: z.string().min(1).max(200),
  /** Empty when a picture came with no words. */
  text: z.string().max(4000),
  photo: turnPhotoSchema.optional(),
});

export type TurnRequest = z.infer<typeof turnRequestSchema>;

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
