import { describe, expect, it } from "vitest";
import {
  LINK_CODE_LENGTH,
  formatLinkCode,
  generateLinkCode,
  normalizeLinkCode,
} from "./link-code";

describe("generateLinkCode", () => {
  it("returns six digits", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateLinkCode()).toMatch(/^\d{6}$/);
    }
    expect(LINK_CODE_LENGTH).toBe(6);
  });

  it("pads low values with zeros", () => {
    expect(generateLinkCode(() => 42)).toBe("000042");
    expect(generateLinkCode(() => 1_482_193)).toBe("482193");
  });

  it("draws again when a value would bias the result", () => {
    // 2^32 is not a multiple of a million; the top slice is rejected.
    const draws = [4_294_967_295, 4_294_000_000, 7];
    expect(generateLinkCode(() => draws.shift()!)).toBe("000007");
    expect(draws).toEqual([]);
  });
});

describe("formatLinkCode", () => {
  it("splits the code in two", () => {
    expect(formatLinkCode("482193")).toBe("482 193");
  });
});

describe("normalizeLinkCode", () => {
  it("accepts spaces and dashes inside the code", () => {
    expect(normalizeLinkCode("482193")).toBe("482193");
    expect(normalizeLinkCode("482 193")).toBe("482193");
    expect(normalizeLinkCode(" 482-193 ")).toBe("482193");
    expect(normalizeLinkCode("4 8 2 1 9 3")).toBe("482193");
  });

  it("rejects anything that is not six digits", () => {
    for (const bad of ["", "48219", "4821933", "48219a", "482.193", "abc"]) {
      expect(normalizeLinkCode(bad)).toBeNull();
    }
  });
});
