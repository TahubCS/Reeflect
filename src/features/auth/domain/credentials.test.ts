import { describe, expect, it } from "vitest";
import {
  authFailureMessage,
  parseEmailOnly,
  parseNewPassword,
  parseSignIn,
  parseSignUp,
  prefillEmail,
  resetToken,
  verificationLinkMessage,
} from "./credentials";

describe("prefillEmail", () => {
  it("keeps one valid address", () => {
    expect(prefillEmail("sam@example.test")).toBe("sam@example.test");
  });

  it("ignores a missing, invalid, repeated or over-long address", () => {
    expect(prefillEmail(undefined)).toBe("");
    expect(prefillEmail("not-an-email")).toBe("");
    expect(prefillEmail(["a@example.test", "b@example.test"])).toBe("");
    expect(prefillEmail(`${"a".repeat(250)}@example.test`)).toBe("");
  });
});

const VALID = {
  name: "Sam Rivera",
  email: "sam@example.test",
  password: "correct-horse",
};

describe("parseSignUp", () => {
  it("accepts a name, an email and a password, and trims the name", () => {
    expect(parseSignUp({ ...VALID, name: "  Sam Rivera " })).toEqual({
      ok: true,
      value: VALID,
    });
  });

  it("reports every field that is wrong", () => {
    expect(parseSignUp({ name: " ", email: "sam", password: "short" })).toEqual(
      {
        ok: false,
        errors: {
          name: "Enter your name.",
          email: "Enter an email address like name@example.com.",
          password: "Use at least 8 characters.",
        },
      },
    );
  });

  it("accepts a password of exactly 8 characters and rejects 7", () => {
    expect(parseSignUp({ ...VALID, password: "12345678" }).ok).toBe(true);
    expect(parseSignUp({ ...VALID, password: "1234567" }).ok).toBe(false);
  });

  it("rejects a name or password that is too long", () => {
    expect(parseSignUp({ ...VALID, name: "n".repeat(81) })).toMatchObject({
      errors: { name: "Use 80 characters or fewer." },
    });
    expect(parseSignUp({ ...VALID, password: "p".repeat(129) })).toMatchObject({
      errors: { password: "Use 128 characters or fewer." },
    });
  });

  it("rejects missing fields instead of throwing", () => {
    const result = parseSignUp({});

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("errors.name");
    expect(result).toHaveProperty("errors.email");
    expect(result).toHaveProperty("errors.password");
  });
});

describe("parseSignIn", () => {
  it("accepts an email and any non-empty password", () => {
    const input = { email: "sam@example.test", password: "x" };

    expect(parseSignIn(input)).toEqual({ ok: true, value: input });
  });

  it("asks for the password when it is empty", () => {
    expect(parseSignIn({ email: "sam@example.test", password: "" })).toEqual({
      ok: false,
      errors: { password: "Enter your password." },
    });
  });

  it("rejects a malformed email", () => {
    expect(parseSignIn({ email: "sam@", password: "x" })).toMatchObject({
      errors: { email: "Enter an email address like name@example.com." },
    });
  });
});

describe("authFailureMessage", () => {
  it("asks an unverified user to confirm their email (ADR-051)", () => {
    expect(
      authFailureMessage({ status: 403, code: "EMAIL_NOT_VERIFIED" }),
    ).toBe("Confirm your email first. We've sent a new link to your inbox.");
  });

  it("explains an expired reset link", () => {
    expect(authFailureMessage({ status: 400, code: "INVALID_TOKEN" })).toBe(
      "That reset link has expired. Ask for a new one.",
    );
  });

  it("explains a wrong email or password", () => {
    expect(
      authFailureMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }),
    ).toBe("That email and password don't match.");
  });

  it("explains an email that is already registered", () => {
    expect(
      authFailureMessage({
        status: 422,
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      }),
    ).toBe("An account with that email already exists. Sign in instead.");
  });

  it("explains rate limiting, whatever the code", () => {
    expect(authFailureMessage({ status: 429 })).toBe(
      "Too many attempts. Wait a moment and try again.",
    );
  });

  it("falls back to a generic message without leaking details", () => {
    expect(
      authFailureMessage({ status: 500, code: "FAILED_TO_CREATE_USER" }),
    ).toBe("Something went wrong. Please try again.");
    expect(authFailureMessage({})).toBe(
      "Something went wrong. Please try again.",
    );
  });
});

describe("parseEmailOnly", () => {
  it("accepts an email address", () => {
    expect(parseEmailOnly({ email: "sam@example.test" })).toEqual({
      ok: true,
      value: { email: "sam@example.test" },
    });
  });

  it("explains a missing or malformed address", () => {
    expect(parseEmailOnly({ email: "nope" })).toEqual({
      ok: false,
      errors: { email: "Enter an email address like name@example.com." },
    });
  });
});

describe("parseNewPassword", () => {
  it("accepts 8 to 128 characters", () => {
    expect(parseNewPassword({ password: "a".repeat(8) }).ok).toBe(true);
    expect(parseNewPassword({ password: "a".repeat(128) }).ok).toBe(true);
  });

  it("rejects a password that is too short or too long", () => {
    expect(parseNewPassword({ password: "short" })).toEqual({
      ok: false,
      errors: { password: "Use at least 8 characters." },
    });
    expect(parseNewPassword({ password: "a".repeat(129) })).toEqual({
      ok: false,
      errors: { password: "Use 128 characters or fewer." },
    });
  });
});

describe("resetToken", () => {
  it("keeps a URL-safe token", () => {
    expect(resetToken("AbC-123_xyz")).toBe("AbC-123_xyz");
  });

  it("ignores a missing, repeated, empty or odd token", () => {
    expect(resetToken(undefined)).toBeNull();
    expect(resetToken(["a", "b"])).toBeNull();
    expect(resetToken("")).toBeNull();
    expect(resetToken("<script>")).toBeNull();
    expect(resetToken("a".repeat(257))).toBeNull();
  });
});

describe("verificationLinkMessage", () => {
  it("says an expired link has expired", () => {
    expect(verificationLinkMessage("TOKEN_EXPIRED")).toBe(
      "That link has expired. Sign in and we'll send you a new one.",
    );
  });

  it("gives a general message for any other code", () => {
    const general =
      "That link doesn't work any more. Sign in and we'll send you a new one.";
    expect(verificationLinkMessage("INVALID_TOKEN")).toBe(general);
    expect(verificationLinkMessage(["x"])).toBe(general);
  });
});
