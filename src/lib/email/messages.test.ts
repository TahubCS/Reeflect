import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/config/app";
import { escapeHtml, passwordResetEmail, verificationEmail } from "./messages";

const SAM = { name: "Sam Rivera", email: "sam@example.test" };
const URL =
  "https://app.example.test/api/auth/verify-email?token=abc&callbackURL=%2F";

describe("escapeHtml", () => {
  it("escapes the five HTML special characters", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });
});

describe("verificationEmail", () => {
  it("greets by name and carries the link in text and HTML", () => {
    const email = verificationEmail(SAM, URL);

    expect(email.to).toBe("sam@example.test");
    expect(email.subject).toBe(`Confirm your email for ${APP_NAME}`);
    expect(email.text).toContain("Hi Sam Rivera,");
    expect(email.text).toContain(`Confirm your email: ${URL}`);
    expect(email.html).toContain(`href="${escapeHtml(URL)}"`);
    expect(email.text).toContain("one hour");
  });

  it("escapes a name that contains HTML", () => {
    const email = verificationEmail(
      { name: "<script>x</script>", email: "a@example.test" },
      URL,
    );

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("falls back to a plain greeting when the name is blank", () => {
    expect(verificationEmail({ ...SAM, name: "  " }, URL).text).toMatch(
      /^Hi,\n/,
    );
  });

  it("contains no digits other than those in the link (no amounts)", () => {
    const { text } = verificationEmail(SAM, "https://x.test/v");

    expect(text).not.toMatch(/\d/);
  });
});

describe("passwordResetEmail", () => {
  it("names the app and carries the reset link", () => {
    const url = "https://app.example.test/api/auth/reset-password/tok";
    const email = passwordResetEmail(SAM, url);

    expect(email.subject).toBe(`Reset your ${APP_NAME} password`);
    expect(email.text).toContain(`Choose a new password: ${url}`);
    expect(email.text).toContain("your password stays the same");
    expect(email.html).toContain(`href="${url}"`);
  });
});
