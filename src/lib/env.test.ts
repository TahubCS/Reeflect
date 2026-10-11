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

  it("treats the agent token as optional, empty as unset, and short as invalid", () => {
    const base = { DATABASE_URL: POOLED, ...AUTH };
    const token = "agent-token-0123456789-0123456789-abc";

    expect(parseEnv(base).AGENT_SERVICE_TOKEN).toBe(undefined);
    expect(
      parseEnv({ ...base, AGENT_SERVICE_TOKEN: " " }).AGENT_SERVICE_TOKEN,
    ).toBe(undefined);
    expect(
      parseEnv({ ...base, AGENT_SERVICE_TOKEN: token }).AGENT_SERVICE_TOKEN,
    ).toBe(token);

    const attempt = (): unknown =>
      parseEnv({ ...base, AGENT_SERVICE_TOKEN: "short-token" });
    expect(attempt).toThrow(/AGENT_SERVICE_TOKEN/);
    expect(attempt).not.toThrow(/short-token/);
  });

  it("accepts the agent phone number only in international format", () => {
    const base = { DATABASE_URL: POOLED, ...AUTH };

    expect(parseEnv(base).AGENT_PHONE_NUMBER).toBe(undefined);
    expect(
      parseEnv({ ...base, AGENT_PHONE_NUMBER: "" }).AGENT_PHONE_NUMBER,
    ).toBe(undefined);
    expect(
      parseEnv({ ...base, AGENT_PHONE_NUMBER: "+15551234567" })
        .AGENT_PHONE_NUMBER,
    ).toBe("+15551234567");
    expect(() =>
      parseEnv({ ...base, AGENT_PHONE_NUMBER: "555-123-4567" }),
    ).toThrow(/AGENT_PHONE_NUMBER/);
  });

  it("rejects a malformed auth URL", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: POOLED, ...AUTH, BETTER_AUTH_URL: "localhost" }),
    ).toThrow(/BETTER_AUTH_URL/);
  });
});
