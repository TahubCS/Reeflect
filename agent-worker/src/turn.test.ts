import { describe, expect, it } from "vitest";
import { type IncomingMessage, toTurn } from "./turn.ts";

const space = { id: "any;-;+15551234567", type: "dm" };
const message: IncomingMessage = {
  id: "message-1",
  platform: "imessage",
  direction: "inbound",
  content: { type: "text", text: "how am I doing?" },
  sender: { id: "+15551234567" },
};

describe("toTurn", () => {
  it("forwards a text someone sent in a direct chat", () => {
    expect(toTurn(space, message)).toEqual({
      platform: "imessage",
      handle: "+15551234567",
      spaceId: "any;-;+15551234567",
      messageId: "message-1",
      text: "how am I doing?",
      kind: "text",
      spaceType: "direct",
    });
  });

  it("forwards a text from the development terminal, whose spaces have no type", () => {
    expect(
      toTurn({ id: "chat-1" }, { ...message, platform: "terminal" }),
    ).toMatchObject({ platform: "terminal", spaceId: "chat-1" });
  });

  it("forwards an empty text as it is", () => {
    expect(
      toTurn(space, { ...message, content: { type: "text", text: "" } }),
    ).toMatchObject({ text: "" });
  });

  it("stays silent on the agent's own messages", () => {
    expect(toTurn(space, { ...message, direction: "outbound" })).toBeNull();
  });

  it("stays silent in group chats", () => {
    expect(toTurn({ ...space, type: "group" }, message)).toBeNull();
  });

  it("stays silent in a chat whose type it does not know", () => {
    expect(toTurn({ ...space, type: "channel" }, message)).toBeNull();
  });

  it("reads a swipe reply and a text with an effect as the text inside (HO-074)", () => {
    for (const content of [
      { type: "reply", content: { type: "text", text: "2" } },
      { type: "effect", effect: "slam", content: { type: "text", text: "2" } },
      { type: "markdown", markdown: "2" },
    ]) {
      expect(toTurn(space, { ...message, content })).toMatchObject({
        kind: "text",
        text: "2",
      });
    }
  });

  it("forwards edits, photos and voice notes so the app can say what it reads", () => {
    expect(
      toTurn(space, {
        ...message,
        content: { type: "edit", content: { type: "text", text: "15 lunch" } },
      }),
    ).toMatchObject({ kind: "edit", text: "15 lunch" });
    expect(
      toTurn(space, { ...message, content: { type: "attachment" } }),
    ).toMatchObject({ kind: "attachment", text: "" });
    expect(
      toTurn(space, { ...message, content: { type: "voice" } }),
    ).toMatchObject({ kind: "voice", text: "" });
    expect(
      toTurn(space, {
        ...message,
        content: {
          type: "group",
          items: [
            { content: { type: "attachment" } },
            { content: { type: "text", text: "receipt" } },
          ],
        },
      }),
    ).toMatchObject({ kind: "attachment", text: "receipt" });
    expect(
      toTurn(space, {
        ...message,
        content: { type: "reply", content: { type: "attachment" } },
      }),
    ).toMatchObject({ kind: "attachment" });
  });

  it("stays silent on tapbacks, typing and content it cannot read", () => {
    for (const content of [
      { type: "reaction" },
      { type: "typing" },
      { type: "read" },
      { type: "text" },
      { type: "text", text: 42 },
      { type: "reply" },
      { type: "reply", content: "2" },
    ]) {
      expect(toTurn(space, { ...message, content })).toBeNull();
    }
  });

  it("stays silent on platforms the app does not know", () => {
    for (const platform of ["telegram", "local_imessage", ""]) {
      expect(toTurn(space, { ...message, platform })).toBeNull();
    }
  });

  it("stays silent when the platform recorded no sender", () => {
    expect(toTurn(space, { ...message, sender: undefined })).toBeNull();
  });
});
