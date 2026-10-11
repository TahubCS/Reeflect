import { describe, expect, it } from "vitest";
import { maskHandle, normalizeHandle } from "./handle";

describe("normalizeHandle", () => {
  it("strips formatting from phone numbers", () => {
    expect(normalizeHandle("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizeHandle(" +15551234567 ")).toBe("+15551234567");
    expect(normalizeHandle("555.123.4567")).toBe("5551234567");
  });

  it("lowercases and trims addresses", () => {
    expect(normalizeHandle(" Sam@iCloud.com ")).toBe("sam@icloud.com");
  });

  it("leaves short digit strings and other ids as they are", () => {
    expect(normalizeHandle("12345")).toBe("12345");
    expect(normalizeHandle("Chat-1")).toBe("chat-1");
  });
});

describe("maskHandle", () => {
  it("shows only the last four digits of a phone number", () => {
    expect(maskHandle("+15551234567")).toBe("phone ending 4567");
    expect(maskHandle("5551234567")).toBe("phone ending 4567");
  });

  it("shows the first letter and the domain of an address", () => {
    expect(maskHandle("sam@icloud.com")).toBe("s***@icloud.com");
  });

  it("hides everything but the first character of anything else", () => {
    expect(maskHandle("chat-1")).toBe("c***");
    expect(maskHandle("@odd")).toBe("@***");
    expect(maskHandle("")).toBe("***");
  });
});
