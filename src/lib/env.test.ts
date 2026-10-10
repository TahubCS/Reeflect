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

  it("rejects a malformed auth URL", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: POOLED, ...AUTH, BETTER_AUTH_URL: "localhost" }),
    ).toThrow(/BETTER_AUTH_URL/);
  });
});
