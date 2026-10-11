import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { type APIRequestContext, type Page, expect } from "@playwright/test";

/** Session saved by auth.setup.ts. Use with `test.use({ storageState })`. */
export const SIGNED_IN_STATE = "test-results/.auth/user.json";

/**
 * Waits until React has attached its event handlers to the element, so a
 * click or key press right after page load is not lost.
 */
export async function hydrated(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((target) => {
    const element = document.querySelector(target);
    return (
      element !== null &&
      Object.keys(element).some((key) => key.startsWith("__reactProps"))
    );
  }, selector);
}

/**
 * A header that makes a test look like its own client. Better Auth rate-limits
 * sign-up and sign-in per IP address, and every test would otherwise share
 * one address and one allowance.
 */
export function ownClientAddress(): Record<string, string> {
  const part = (): number => 1 + Math.floor(Math.random() * 254);
  return { "x-forwarded-for": `10.${part()}.${part()}.${part()}` };
}

/** Where the server under test writes emails: it has no Resend key (ADR-052). */
const OUTBOX_DIR = ".email-outbox";

type OutboxEmail = { to: string; subject: string; text: string };

async function emailsTo(address: string): Promise<OutboxEmail[]> {
  const files = await readdir(OUTBOX_DIR).catch(() => []);
  const emails = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map(async (file) => {
        const contents = await readFile(join(OUTBOX_DIR, file), "utf8");
        try {
          return JSON.parse(contents) as OutboxEmail;
        } catch (error) {
          // Parallel signups can observe a file before writeFile finishes.
          // The next emailedLink poll reads it again once it is complete.
          if (error instanceof SyntaxError) return null;
          throw error;
        }
      }),
  );
  return emails.filter(
    (email): email is OutboxEmail => email !== null && email.to === address,
  );
}

/**
 * The link in the newest email to `address` whose subject starts with
 * `subject`. Waits for it: the server sends after it has responded.
 */
export async function emailedLink(
  address: string,
  subject: RegExp,
  { after = 0 }: { after?: number } = {},
): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const matching = (await emailsTo(address)).filter((email) =>
          subject.test(email.subject),
        );
        const newest = matching.length > after ? matching.at(-1) : undefined;
        link = newest?.text.match(/https?:\/\/\S+/)?.[0] ?? "";
        return link;
      },
      { message: `an email to ${address} matching ${subject}` },
    )
    .not.toBe("");
  return link;
}

/** How many emails matching `subject` have gone to `address` so far. */
export async function emailCount(
  address: string,
  subject: RegExp,
): Promise<number> {
  return (await emailsTo(address)).filter((email) =>
    subject.test(email.subject),
  ).length;
}

export const VERIFY_SUBJECT = /^Confirm your email/;
export const RESET_SUBJECT = /^Reset your/;

/**
 * Signs a new user up through the API and opens the verification link, which
 * signs them in on `request`'s cookies (ADR-052).
 */
export async function signUpVerified(
  request: APIRequestContext,
  baseURL: string | undefined,
  user: { name: string; email: string; password?: string },
): Promise<void> {
  const headers = { origin: baseURL ?? "", ...ownClientAddress() };
  const response = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { password: "correct-horse-battery-staple", ...user },
  });
  expect(response.status()).toBe(200);
  const link = await emailedLink(user.email, VERIFY_SUBJECT);
  const verified = await request.get(link, { headers });
  expect(verified.ok()).toBe(true);
}
