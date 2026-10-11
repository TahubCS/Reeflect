import { PLATFORMS } from "@reeflect/agent-protocol";
import { describe, expect, it } from "vitest";
import { MESSAGING_PLATFORMS } from "@/lib/db/schema";
import { platformAllowed } from "./platform";

describe("platformAllowed", () => {
  it("takes iMessage everywhere", () => {
    expect(platformAllowed("imessage", true)).toBe(true);
    expect(platformAllowed("imessage", false)).toBe(true);
  });

  it("takes the development terminal only when not deployed", () => {
    expect(platformAllowed("terminal", false)).toBe(true);
    expect(platformAllowed("terminal", true)).toBe(false);
  });

  it("is not deployed under test", () => {
    expect(platformAllowed("terminal")).toBe(true);
  });
});

describe("platform lists", () => {
  it("are the same in the protocol and the database schema", () => {
    expect([...MESSAGING_PLATFORMS]).toEqual([...PLATFORMS]);
  });
});
