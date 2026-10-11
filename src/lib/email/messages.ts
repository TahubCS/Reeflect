import { APP_NAME } from "@/config/app";

// The emails the app sends (ADR-051). They hold a greeting and a link only:
// never amounts, balances, account names or other financial data.

export type EmailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

type Recipient = { readonly name: string; readonly email: string };

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Makes user-supplied text (a name, a URL) safe inside HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? "");
}

function greeting(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? "Hi," : `Hi ${trimmed},`;
}

function compose(
  to: Recipient,
  subject: string,
  lines: { intro: string; action: string; url: string; outro: string },
): EmailMessage {
  const text = [
    greeting(to.name),
    "",
    lines.intro,
    "",
    `${lines.action}: ${lines.url}`,
    "",
    lines.outro,
    "",
    `— ${APP_NAME}`,
  ].join("\n");
  const html = [
    `<p>${escapeHtml(greeting(to.name))}</p>`,
    `<p>${escapeHtml(lines.intro)}</p>`,
    `<p><a href="${escapeHtml(lines.url)}">${escapeHtml(lines.action)}</a></p>`,
    `<p>${escapeHtml(lines.outro)}</p>`,
    `<p>— ${escapeHtml(APP_NAME)}</p>`,
  ].join("\n");
  return { to: to.email, subject, text, html };
}

/** Sent after sign-up, and when an unverified user tries to sign in. */
export function verificationEmail(to: Recipient, url: string): EmailMessage {
  return compose(to, `Confirm your email for ${APP_NAME}`, {
    intro: `Confirm this address to finish setting up ${APP_NAME}.`,
    action: "Confirm your email",
    url,
    outro:
      "The link works for one hour. If you didn't sign up, you can ignore this email.",
  });
}

/** Sent when someone asks to reset the password for this address. */
export function passwordResetEmail(to: Recipient, url: string): EmailMessage {
  return compose(to, `Reset your ${APP_NAME} password`, {
    intro: "Someone asked to reset the password for this account.",
    action: "Choose a new password",
    url,
    outro:
      "The link works for one hour. If you didn't ask for this, you can ignore this email; your password stays the same.",
  });
}
