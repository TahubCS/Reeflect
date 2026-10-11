import { z } from "zod";

// What the agent worker sends the app for each inbound message, and what
// the app answers (ADR-032, ARCH-13). Both sides validate with these, so a
// change here is a change to the contract between them.

/** `terminal` is Spectrum's development chat; the app refuses it when deployed. */
export const PLATFORMS = ["imessage", "terminal"] as const;

export type Platform = (typeof PLATFORMS)[number];

export const turnRequestSchema = z.object({
  platform: z.enum(PLATFORMS),
  /** The sender's phone number or address, as the platform reports it. */
  handle: z.string().trim().min(1).max(320),
  spaceId: z.string().min(1).max(200),
  messageId: z.string().min(1).max(200),
  text: z.string().max(4000),
});

export type TurnRequest = z.infer<typeof turnRequestSchema>;

export const turnResponseSchema = z.object({
  reply: z.string().min(1),
});

export type TurnResponse = z.infer<typeof turnResponseSchema>;
