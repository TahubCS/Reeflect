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

  it("takes object storage as all five variables or none, without echoing values", () => {
    const base = { DATABASE_URL: POOLED, ...AUTH };
    const storage = {
      AWS_ACCESS_KEY_ID: "key-id",
      AWS_SECRET_ACCESS_KEY: "very-secret-value",
      AWS_ENDPOINT_URL_S3: "https://storage.example.test",
      AWS_REGION: "us-east-2",
      STATEMENTS_BUCKET: "statements",
    };

    expect(parseEnv(base).STATEMENTS_BUCKET).toBe(undefined);
    expect(
      parseEnv({
        ...base,
        VERCEL: "1",
        RESEND_API_KEY: "k",
        EMAIL_FROM: "a <a@b.test>",
      }).AWS_REGION,
    ).toBe(undefined);
    expect(parseEnv({ ...base, ...storage }).AWS_ENDPOINT_URL_S3).toBe(
      "https://storage.example.test",
    );
    const partial = (): unknown =>
      parseEnv({
        ...base,
        AWS_SECRET_ACCESS_KEY: storage.AWS_SECRET_ACCESS_KEY,
      });
    expect(partial).toThrow(
      /STATEMENTS_BUCKET: required when any object storage variable is set/,
    );
    expect(partial).not.toThrow(/very-secret-value/);
    expect(() =>
      parseEnv({ ...base, ...storage, AWS_ENDPOINT_URL_S3: "not a url" }),
    ).toThrow(/AWS_ENDPOINT_URL_S3/);
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
