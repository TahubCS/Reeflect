import { describe, expect, it } from "vitest";
import { hasServiceToken } from "./service-token";

const TOKEN = "a-service-token-0123456789-0123456789";

describe("hasServiceToken", () => {
  it("accepts the configured token as a bearer token", () => {
    expect(hasServiceToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("rejects a missing, wrong, partial or differently presented token", () => {
    for (const header of [
      null,
      "",
      "Bearer ",
      "Bearer wrong",
      `Bearer ${TOKEN.slice(0, -1)}`,
      `Bearer ${TOKEN}x`,
      `bearer ${TOKEN}`,
      `Basic ${TOKEN}`,
      TOKEN,
    ]) {
      expect(hasServiceToken(header, TOKEN)).toBe(false);
    }
  });

  it("rejects everything when no token is configured", () => {
    expect(hasServiceToken(`Bearer ${TOKEN}`, undefined)).toBe(false);
    expect(hasServiceToken("Bearer ", "")).toBe(false);
    expect(hasServiceToken("Bearer undefined", undefined)).toBe(false);
  });

  it("uses the token from the environment by default", () => {
    // Set in vitest.config.mts.
    expect(
      hasServiceToken("Bearer test-only-agent-service-token-0123456789"),
    ).toBe(true);
    expect(hasServiceToken(`Bearer ${TOKEN}`)).toBe(false);
  });
});
