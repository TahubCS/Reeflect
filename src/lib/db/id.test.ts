import { describe, expect, it } from "vitest";
import { uuidv7 } from "./id";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("has the version 7 and variant bits", () => {
    expect(uuidv7()).toMatch(UUID_V7);
  });

  it("starts with the timestamp, so later ids sort after earlier ones", () => {
    const earlier = uuidv7(1_791_651_907_479);
    const later = uuidv7(1_791_651_907_480);
    expect(earlier < later).toBe(true);
  });

  it("encodes the millisecond timestamp in the first 48 bits", () => {
    const id = uuidv7(0x0123_4567_89ab);
    expect(id.slice(0, 13)).toBe("01234567-89ab");
  });

  it("is different every time", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidv7(0)));
    expect(ids.size).toBe(100);
  });
});
