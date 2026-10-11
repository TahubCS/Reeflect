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

  it("stays silent on anything that is not plain text", () => {
    for (const content of [
      { type: "attachment" },
      { type: "reaction" },
      { type: "typing" },
      { type: "text" },
      { type: "text", text: 42 },
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
