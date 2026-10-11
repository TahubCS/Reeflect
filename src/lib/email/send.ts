import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EmailMessage } from "./messages";

/** Where emails go when there is no Resend key (ADR-052). Gitignored. */
export const OUTBOX_DIR = ".email-outbox";

/** The part of the Resend SDK we use, so tests can pass a fake. */
export type ResendLike = {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<{
      data: { id: string } | null;
      error: { name: string } | null;
    }>;
  };
};

export type SenderConfig =
  | { kind: "resend"; client: ResendLike; from: string }
  | { kind: "outbox"; dir: string; from: string };

export type SendResult =
  { ok: true; id: string } | { ok: false; reason: string };

async function writeToOutbox(
  dir: string,
  from: string,
  message: EmailMessage,
): Promise<SendResult> {
  const id = randomUUID();
  await mkdir(dir, { recursive: true });
  // The time first, so a directory listing sorts oldest to newest.
  const file = join(dir, `${Date.now()}-${id}.json`);
  await writeFile(file, JSON.stringify({ id, from, ...message }, null, 2));
  return { ok: true, id };
}

/**
 * Sends one email and never throws: a failure is logged with the recipient's
 * user id and the provider's error name only (ADR-052), and returned.
 */
export async function deliver(
  config: SenderConfig,
  message: EmailMessage,
  userId: string,
): Promise<SendResult> {
  let result: SendResult;
  try {
    if (config.kind === "outbox") {
      result = await writeToOutbox(config.dir, config.from, message);
    } else {
      const { data, error } = await config.client.emails.send({
        from: config.from,
        ...message,
      });
      result =
        error === null && data !== null
          ? { ok: true, id: data.id }
          : { ok: false, reason: error?.name ?? "no message id" };
    }
  } catch (error) {
    result = {
      ok: false,
      reason: error instanceof Error ? error.name : "unknown error",
    };
  }
  if (result.ok) {
    console.info("email: sent", { userId, messageId: result.id });
  } else {
    console.error("email: not sent", { userId, reason: result.reason });
  }
  return result;
}
