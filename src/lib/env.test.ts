import { afterEach, describe, expect, it, vi } from "vitest";
import { parseServerEnv } from "./env";

const VALID = {
  DATABASE_URL: "postgres://test:test@localhost:5432/app_test",
  BETTER_AUTH_SECRET: "test-only-not-a-real-secret-0123456789",
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseServerEnv", () => {
  it("accepts a complete environment", () => {
    expect(parseServerEnv(VALID)).toEqual(VALID);
  });

  it("names every missing variable", () => {
    expect(() => parseServerEnv({})).toThrow(
      "DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL",
    );
  });

  it("rejects a secret shorter than 32 characters without printing it", () => {
    const short = "too-short-secret";

    expect(() =>
      parseServerEnv({ ...VALID, BETTER_AUTH_SECRET: short }),
    ).toThrow(/BETTER_AUTH_SECRET/);
    expect(() =>
      parseServerEnv({ ...VALID, BETTER_AUTH_SECRET: short }),
    ).not.toThrow(short);
  });

  it("rejects a malformed URL", () => {
    expect(() =>
      parseServerEnv({ ...VALID, BETTER_AUTH_URL: "localhost" }),
    ).toThrow(/BETTER_AUTH_URL/);
  });
});

describe("serverEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reads process.env once and caches the result", async () => {
    for (const [name, value] of Object.entries(VALID)) vi.stubEnv(name, value);
    const { serverEnv } = await import("./env");

    const first = serverEnv();
    vi.stubEnv("BETTER_AUTH_URL", "http://changed.example");

    expect(serverEnv()).toBe(first);
    expect(first.BETTER_AUTH_URL).toBe(VALID.BETTER_AUTH_URL);
  });
});
