import { describe, expect, it } from "vitest";
import {
  PLATFORMS,
  sendRequestSchema,
  turnRequestSchema,
  turnResponseSchema,
} from "./index";

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

  it("accepts every platform in the list, and no other", () => {
    for (const platform of PLATFORMS) {
      expect(turnRequestSchema.safeParse({ ...valid, platform }).success).toBe(
        true,
      );
    }
    expect(PLATFORMS).toEqual(["imessage", "terminal"]);
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

describe("sendRequestSchema", () => {
  const send = {
    platform: "imessage",
    spaceId: "any;-;+15551234567",
    text: "You're linked.",
  };

  it("accepts a well-formed request and trims the text", () => {
    expect(sendRequestSchema.parse(send)).toEqual(send);
    expect(sendRequestSchema.parse({ ...send, text: " Hi \n" }).text).toBe(
      "Hi",
    );
  });

  it("rejects missing, mistyped and oversized fields", () => {
    const bad: unknown[] = [
      {},
      null,
      { ...send, platform: "telegram" },
      { ...send, spaceId: "" },
      { ...send, spaceId: "x".repeat(201) },
      { ...send, text: "" },
      { ...send, text: "   " },
      { ...send, text: 42 },
      { ...send, text: "x".repeat(1001) },
    ];
    for (const input of bad) {
      expect(sendRequestSchema.safeParse(input).success).toBe(false);
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
