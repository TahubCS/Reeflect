import { describe, expect, it } from "vitest";
import { parseAlertReply } from "./reply";

describe("parseAlertReply", () => {
  it("reads the four replies, in any case, with punctuation", () => {
    expect(parseAlertReply("KEEP")).toEqual({ type: "keep" });
    expect(parseAlertReply(" keep it! ")).toEqual({ type: "keep" });
    expect(parseAlertReply("Cancel.")).toEqual({ type: "cancel" });
    expect(parseAlertReply("ignore")).toEqual({ type: "ignore" });
    expect(parseAlertReply("Not mine")).toEqual({ type: "ignore" });
    expect(parseAlertReply("not a subscription")).toEqual({ type: "ignore" });
    expect(parseAlertReply("Details?")).toEqual({ type: "details" });
  });

  it("only counts a whole message", () => {
    for (const text of [
      "keep track of lunch",
      "cancel my last expense",
      "details on my budget",
      "how am I doing?",
      "",
    ]) {
      expect(parseAlertReply(text)).toEqual({ type: "none" });
    }
  });
});
