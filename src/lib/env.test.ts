import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const POOLED = "postgresql://app:secret-password@ep-x-pooler.neon.tech/app";
const DIRECT = "postgresql://app:secret-password@ep-x.neon.tech/app";

describe("parseEnv", () => {
  it("accepts a pooled URL alone", () => {
    expect(parseEnv({ DATABASE_URL: POOLED })).toEqual({
      DATABASE_URL: POOLED,
    });
  });

  it("accepts a pooled and a direct URL", () => {
    const env = parseEnv({
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: DIRECT,
    });

    expect(env.DATABASE_URL_UNPOOLED).toBe(DIRECT);
  });

  it("names the missing variable", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a value that is not a postgres URL without echoing it", () => {
    const attempt = (): unknown =>
      parseEnv({ DATABASE_URL: "https://secret-password@example.com" });

    expect(attempt).toThrow(/DATABASE_URL: must start with postgres/);
    expect(attempt).not.toThrow(/secret-password/);
  });
});
