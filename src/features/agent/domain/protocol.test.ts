import { describe, expect, it } from "vitest";
import { turnRequestSchema, turnResponseSchema } from "./protocol";

const valid = {
  platform: "imessage",
  handle: "+15551234567",
  spaceId: "any;-;+15551234567",
  messageId: "m-1",
  text: "LINK 482193",
};

describe("turnRequestSchema", () => {
  it("accepts a well-formed turn", () => {
    expect(turnRequestSchema.parse(valid)).toEqual(valid);
  });

  it("accepts an empty text and trims the handle", () => {
    expect(
      turnRequestSchema.parse({ ...valid, text: "", handle: " a@b.co " }),
    ).toMatchObject({ text: "", handle: "a@b.co" });
  });

  it("rejects missing, mistyped and oversized fields", () => {
    const bad: unknown[] = [
      {},
      null,
      "LINK 482193",
      { ...valid, platform: "telegram" },
      { ...valid, handle: "" },
      { ...valid, handle: "   " },
      { ...valid, handle: "x".repeat(321) },
      { ...valid, spaceId: "" },
      { ...valid, messageId: undefined },
      { ...valid, text: 42 },
      { ...valid, text: "x".repeat(4001) },
    ];
    for (const input of bad) {
      expect(turnRequestSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("turnResponseSchema", () => {
  it("needs a non-empty reply", () => {
    expect(turnResponseSchema.safeParse({ reply: "Hi" }).success).toBe(true);
    expect(turnResponseSchema.safeParse({ reply: "" }).success).toBe(false);
    expect(turnResponseSchema.safeParse({}).success).toBe(false);
  });
});
