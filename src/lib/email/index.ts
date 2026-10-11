import "server-only";
import { after } from "next/server";
import { Resend } from "resend";
import { APP_NAME } from "@/config/app";
import { env } from "@/lib/env";
import type { EmailMessage } from "./messages";
import { OUTBOX_DIR, type SenderConfig, deliver } from "./send";

export { passwordResetEmail, verificationEmail } from "./messages";

/** Resend when the key is set; otherwise the local outbox (ADR-051). */
export function senderConfig(
  settings: Pick<typeof env, "RESEND_API_KEY" | "EMAIL_FROM">,
): SenderConfig {
  const from = settings.EMAIL_FROM ?? `${APP_NAME} <no-reply@localhost>`;
  return settings.RESEND_API_KEY === undefined
    ? { kind: "outbox", dir: OUTBOX_DIR, from }
    : { kind: "resend", client: new Resend(settings.RESEND_API_KEY), from };
}

let config: SenderConfig | undefined;

/**
 * Sends after the response has gone out, so response times do not reveal
 * whether an address has an account (ADR-051). Outside a request (scripts,
 * tests) it sends straight away. Never throws.
 */
export function sendAfterResponse(message: EmailMessage, userId: string): void {
  const active = (config ??= senderConfig(env));
  const task = (): Promise<unknown> => deliver(active, message, userId);
  try {
    after(task);
  } catch {
    void task();
  }
}
