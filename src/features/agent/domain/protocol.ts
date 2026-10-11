import { z } from "zod";

// What the worker sends for each inbound message, and what the brain answers
// (ADR-032, ARCH-13). Moves to `packages/agent-protocol/` with the worker,
// which is its second user.

export const turnRequestSchema = z.object({
  platform: z.enum(["imessage"]),
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
