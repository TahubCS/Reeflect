import { describe, expect, it } from "vitest";
import { parseCommand } from "./parse";

describe("parseCommand", () => {
  it("reads LINK with a code, however it is typed", () => {
    for (const text of [
      "LINK 482193",
      "link 482193",
      "  Link   482193  ",
      "LINK: 482193",
      "link #482193",
      "LINK-482193",
      "LINK 482193.",
      "link 482193!",
    ]) {
      expect(parseCommand(text)).toEqual({
        type: "link",
        code: "482193",
        bare: false,
      });
    }
  });

  it("keeps spaces and dashes inside the code for the code check", () => {
    expect(parseCommand("LINK 482 193")).toEqual({
      type: "link",
      code: "482 193",
      bare: false,
    });
    expect(parseCommand("link 482-193")).toEqual({
      type: "link",
      code: "482-193",
      bare: false,
    });
    expect(parseCommand("LINK code 482 193")).toEqual({
      type: "link",
      code: "482 193",
      bare: false,
    });
  });

  it("treats LINK with a short or missing code as a link attempt", () => {
    expect(parseCommand("LINK")).toEqual({
      type: "link",
      code: "",
      bare: false,
    });
    expect(parseCommand("link 123")).toEqual({
      type: "link",
      code: "123",
      bare: false,
    });
  });

  it("does not take a sentence that starts with link for a code (HO-115)", () => {
    for (const text of [
      "LINK my phone",
      "link my chase account",
      "Link to my budget?",
    ]) {
      expect(parseCommand(text)).toEqual({ type: "none" });
    }
  });

  it("reads a six-digit code sent on its own", () => {
    expect(parseCommand("482193")).toEqual({
      type: "link",
      code: "482193",
      bare: true,
    });
    expect(parseCommand(" 482 193 ")).toEqual({
      type: "link",
      code: "482 193",
      bare: true,
    });
    expect(parseCommand("482-193.")).toEqual({
      type: "link",
      code: "482-193",
      bare: true,
    });
  });

  it("does not mistake other numbers or words for a link code", () => {
    for (const text of [
      "12",
      "12 lunch",
      "48219",
      "4821933",
      "linked?",
      "my link is 482193",
      "",
    ]) {
      expect(parseCommand(text)).toEqual({ type: "none" });
    }
  });

  it("reads STOP and its synonyms", () => {
    for (const text of [
      "STOP",
      "stop",
      " Stop. ",
      "stop!",
      "UNLINK",
      "unsubscribe",
    ]) {
      expect(parseCommand(text)).toEqual({ type: "stop" });
    }
  });

  it("does not stop on a sentence that only contains the word", () => {
    for (const text of ["stop spending so much", "don't stop", "stopped"]) {
      expect(parseCommand(text)).toEqual({ type: "none" });
    }
  });
});
