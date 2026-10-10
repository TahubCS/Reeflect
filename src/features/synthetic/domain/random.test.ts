import { describe, expect, it } from "vitest";
import { randomFor } from "./random";

const draw = (parts: string[], count = 20) => {
  const random = randomFor(...parts);
  return Array.from({ length: count }, () => random.next());
};

describe("randomFor", () => {
  it("gives the same sequence for the same seed parts", () => {
    expect(draw(["42", "p01", "2026-07", "income:0"])).toEqual(
      draw(["42", "p01", "2026-07", "income:0"]),
    );
  });

  it("gives different sequences for different streams", () => {
    expect(draw(["42", "p01", "2026-07", "income:0"])).not.toEqual(
      draw(["42", "p01", "2026-08", "income:0"]),
    );
    // Joining must not blur part boundaries.
    expect(draw(["ab", "c"])).not.toEqual(draw(["a", "bc"]));
  });

  it("returns numbers in [0, 1)", () => {
    for (const value of draw(["range"], 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("returns whole numbers including both ends", () => {
    const random = randomFor("ints");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(random.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it("returns min when min equals max", () => {
    expect(randomFor("same").int(7, 7)).toBe(7);
  });

  it("picks only from the list, and refuses an empty one", () => {
    const random = randomFor("pick");
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 50; i += 1) expect(items).toContain(random.pick(items));
    expect(() => random.pick([])).toThrow(RangeError);
  });
});
