import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/config/app";
import {
  CHAT_REPLIES,
  HELP_REPLY,
  mentionsMoney,
  nonTextReply,
  smallTalkOf,
} from "./chat";

describe("smallTalkOf", () => {
  it.each([
    ["help", "help"],
    ["HELP", "help"],
    ["Help!", "help"],
    ["what can you do?", "help"],
    ["How does this work?", "help"],
    ["?", "help"],
    ["", "help"],
    ["   ", "help"],
    ["🤔", "help"],
    ["hi", "greeting"],
    ["Hello!", "greeting"],
    ["hey there", "greeting"],
    [`hey ${APP_NAME}`, "greeting"],
    ["good morning", "greeting"],
    ["thanks", "thanks"],
    ["Thank you!!", "thanks"],
    ["ok", "thanks"],
    ["👍 ok", "thanks"],
    ["sounds good", "thanks"],
  ])("%j is %s", (text, expected) => {
    expect(smallTalkOf(text)).toBe(expected);
  });

  it.each([
    ["hi how am I doing?"],
    ["help me with my budget"],
    ["thanks, what's my balance"],
    ["12 lunch"],
    ["undo"],
    ["stop"],
    ["2"],
  ])("%j is not small talk", (text) => {
    expect(smallTalkOf(text)).toBeNull();
  });
});

describe("mentionsMoney", () => {
  it.each([
    ["how am I doing?"],
    ["what's my balance"],
    ["how much did I spend on food"],
    ["when is payday"],
    ["can I afford new shoes"],
    ["$20"],
    ["status"],
    [`what is ${APP_NAME}`],
  ])("%j is about money or the app", (text) => {
    expect(mentionsMoney(text)).toBe(true);
  });

  it.each([
    ["what's the weather?"],
    ["tell me a joke"],
    ["who won the game"],
    ["write me a poem"],
  ])("%j is not", (text) => {
    expect(mentionsMoney(text)).toBe(false);
  });
});

describe("the replies", () => {
  it("answers each kind that is not plain text, and nothing for text", () => {
    expect(nonTextReply("attachment")).toBe(CHAT_REPLIES.attachment);
    expect(nonTextReply("voice")).toBe(CHAT_REPLIES.voice);
    expect(nonTextReply("edit")).toBe(CHAT_REPLIES.edit);
    expect(nonTextReply("text")).toBeNull();
  });

  it("names every command the agent reads in the help reply", () => {
    for (const command of ["how am I doing", "UNDO", "quiet hours", "STOP"]) {
      expect(HELP_REPLY).toContain(command);
    }
  });

  it("carries no figure from anyone's data, and fits in a text", () => {
    for (const reply of Object.values(CHAT_REPLIES)) {
      // Only the examples' own numbers: "12 lunch", "11pm to 7am".
      expect(reply.replace(/12 lunch|11pm to 7am/g, "")).not.toMatch(/\d/);
      expect(reply.length).toBeLessThan(400);
    }
  });
});
