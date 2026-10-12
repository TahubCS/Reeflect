import { describe, expect, it } from "vitest";
import { createRateLimit } from "./rate-limit";

describe("createRateLimit", () => {
  it("allows up to the limit inside the window, then refuses", () => {
    const limit = createRateLimit({ limit: 3, windowMs: 1000 });
    expect([0, 1, 2, 3].map((at) => limit.allow("a", at))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("allows again once the oldest attempt leaves the window", () => {
    const limit = createRateLimit({ limit: 2, windowMs: 1000 });
    limit.allow("a", 0);
    limit.allow("a", 500);
    expect(limit.allow("a", 999)).toBe(false);
    expect(limit.allow("a", 1000)).toBe(true);
    expect(limit.allow("a", 1001)).toBe(false);
  });

  it("does not count refused attempts against the next window", () => {
    const limit = createRateLimit({ limit: 1, windowMs: 1000 });
    limit.allow("a", 0);
    for (let at = 1; at < 1000; at += 100) limit.allow("a", at);
    expect(limit.allow("a", 1000)).toBe(true);
  });

  it("keeps keys apart", () => {
    const limit = createRateLimit({ limit: 1, windowMs: 1000 });
    expect(limit.allow("a", 0)).toBe(true);
    expect(limit.allow("b", 0)).toBe(true);
    expect(limit.allow("a", 1)).toBe(false);
  });

  it("forgets the oldest key when it holds too many", () => {
    const limit = createRateLimit({ limit: 1, windowMs: 1000, maxKeys: 2 });
    limit.allow("a", 0);
    limit.allow("b", 0);
    limit.allow("c", 0);
    // "a" was dropped, so it starts afresh; "c" is still counted.
    expect(limit.allow("a", 1)).toBe(true);
    expect(limit.allow("c", 1)).toBe(false);
  });
});
