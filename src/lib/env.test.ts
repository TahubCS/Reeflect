import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const POOLED = "postgresql://app:secret-password@ep-x-pooler.neon.tech/app";
const DIRECT = "postgresql://app:secret-password@ep-x.neon.tech/app";
const AUTH = {
  BETTER_AUTH_SECRET: "test-only-not-a-real-secret-0123456789",
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("accepts a pooled URL alone", () => {
    expect(parseEnv({ DATABASE_URL: POOLED, ...AUTH })).toEqual({
      DATABASE_URL: POOLED,
      ...AUTH,
    });
  });

  it("accepts a pooled and a direct URL", () => {
    const env = parseEnv({
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: DIRECT,
      ...AUTH,
    });

    expect(env.DATABASE_URL_UNPOOLED).toBe(DIRECT);
  });

  it("names every missing variable", () => {
    const attempt = (): unknown => parseEnv({});

    expect(attempt).toThrow(/DATABASE_URL/);
    expect(attempt).toThrow(/BETTER_AUTH_SECRET/);
    expect(attempt).toThrow(/BETTER_AUTH_URL/);
  });

  it("rejects a value that is not a postgres URL without echoing it", () => {
    const attempt = (): unknown =>
      parseEnv({
        DATABASE_URL: "https://secret-password@example.com",
        ...AUTH,
      });

    expect(attempt).toThrow(/DATABASE_URL: must start with postgres/);
    expect(attempt).not.toThrow(/secret-password/);
  });

  it("rejects an auth secret shorter than 32 characters without echoing it", () => {
    const short = "too-short-secret";
    const attempt = (): unknown =>
      parseEnv({ DATABASE_URL: POOLED, ...AUTH, BETTER_AUTH_SECRET: short });

    expect(attempt).toThrow(/BETTER_AUTH_SECRET/);
    expect(attempt).not.toThrow(short);
  });

  it("treats the dashboard key as optional, and empty as unset", () => {
    expect(
      parseEnv({ DATABASE_URL: POOLED, ...AUTH }).BETTER_AUTH_API_KEY,
    ).toBe(undefined);
    expect(
      parseEnv({ DATABASE_URL: POOLED, ...AUTH, BETTER_AUTH_API_KEY: "  " })
        .BETTER_AUTH_API_KEY,
    ).toBe(undefined);
    expect(
      parseEnv({ DATABASE_URL: POOLED, ...AUTH, BETTER_AUTH_API_KEY: "ba_key" })
        .BETTER_AUTH_API_KEY,
    ).toBe("ba_key");
  });

  it("treats the Resend key and sender as optional off Vercel", () => {
    const env = parseEnv({
      DATABASE_URL: POOLED,
      ...AUTH,
      RESEND_API_KEY: "",
      EMAIL_FROM: " ",
    });

    expect(env.RESEND_API_KEY).toBe(undefined);
    expect(env.EMAIL_FROM).toBe(undefined);
  });

  it("requires the Resend key and sender on Vercel, without echoing values", () => {
    const attempt = (): unknown =>
      parseEnv({
        DATABASE_URL: POOLED,
        ...AUTH,
        VERCEL: "1",
        EMAIL_FROM: "Reeflect <no-reply@secret-domain.test>",
      });

    expect(attempt).toThrow(/RESEND_API_KEY: required on Vercel/);
    expect(attempt).not.toThrow(/EMAIL_FROM/);
    expect(attempt).not.toThrow(/secret-domain/);
    expect(() =>
      parseEnv({ DATABASE_URL: POOLED, ...AUTH, VERCEL: "1" }),
    ).toThrow(/EMAIL_FROM: required on Vercel/);
    expect(
      parseEnv({
        DATABASE_URL: POOLED,
        ...AUTH,
        VERCEL: "1",
        RESEND_API_KEY: "re_key",
        EMAIL_FROM: "Reeflect <no-reply@example.test>",
      }).RESEND_API_KEY,
    ).toBe("re_key");
  });

  it("requires a sender whenever the Resend key is set", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: POOLED, ...AUTH, RESEND_API_KEY: "re_key" }),
    ).toThrow(/EMAIL_FROM: required when RESEND_API_KEY is set/);
  });

  it("rejects a malformed auth URL", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: POOLED, ...AUTH, BETTER_AUTH_URL: "localhost" }),
    ).toThrow(/BETTER_AUTH_URL/);
  });
});
