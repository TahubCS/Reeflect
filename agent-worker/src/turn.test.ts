import { describe, expect, it } from "vitest";
import { type IncomingMessage, photoToLoad, toTurn } from "./turn.ts";

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

  it("forwards what a threaded reply says", () => {
    expect(
      toTurn(space, {
        ...message,
        content: {
          type: "reply",
          content: { type: "text", text: "yes" },
          target: { id: "question-1" },
        } as IncomingMessage["content"],
      }),
    ).toMatchObject({ text: "yes", messageId: "message-1" });
  });

  it("stays silent on a threaded reply that holds nothing readable", () => {
    for (const content of [
      { type: "reply" },
      { type: "reply", content: { type: "reaction" } },
      { type: "reply", content: "yes" },
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

describe("a picture (ADR-067)", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const picture = (mimeType: string, size?: number) => ({
    type: "attachment",
    id: "attachment-1",
    name: "IMG_0001",
    mimeType,
    size,
    read: async () => bytes,
  });
  const part = (content: IncomingMessage["content"]) => ({ content });
  const withContent = (content: IncomingMessage["content"]) => ({
    ...message,
    content,
  });

  it("forwards a picture alone as a turn with no words, to be downloaded", async () => {
    const sent = withContent(picture("image/heic", 2_000_000));

    expect(toTurn(space, sent)).toEqual({
      platform: "imessage",
      handle: "+15551234567",
      spaceId: "any;-;+15551234567",
      messageId: "message-1",
      text: "",
    });
    const source = photoToLoad(sent);
    expect(source?.mimeType).toBe("image/heic");
    expect(await source?.read()).toBe(bytes);
  });

  it("reads each picture type, however the platform writes it", () => {
    for (const [written, read] of [
      ["image/jpeg", "image/jpeg"],
      ["image/png", "image/png"],
      ["IMAGE/HEIC", "image/heic"],
      ["image/heif", "image/heif"],
      ["image/webp; charset=binary", "image/webp"],
    ]) {
      expect(photoToLoad(withContent(picture(written!)))?.mimeType).toBe(read);
    }
  });

  it("says a file of another type is not supported, and downloads nothing", () => {
    for (const mimeType of [
      "image/gif",
      "application/pdf",
      "video/quicktime",
      "",
    ]) {
      const sent = withContent(picture(mimeType));
      expect(toTurn(space, sent)).toMatchObject({
        text: "",
        photo: { status: "unsupported" },
      });
      expect(photoToLoad(sent)).toBeNull();
    }
  });

  it("says a picture is too large from its stated size, and downloads nothing", () => {
    const sent = withContent(picture("image/jpeg", 3_000_001));

    expect(toTurn(space, sent)).toMatchObject({
      photo: { status: "too_large" },
    });
    expect(photoToLoad(sent)).toBeNull();
    expect(photoToLoad(withContent(picture("image/jpeg", 3_000_000)))).not.toBe(
      null,
    );
  });

  it("says a picture with no way to download it is unavailable", () => {
    const sent = withContent({ type: "attachment", mimeType: "image/png" });

    expect(toTurn(space, sent)).toMatchObject({
      photo: { status: "unavailable" },
    });
  });

  it("forwards a picture with its caption", () => {
    const sent = withContent({
      type: "group",
      items: [
        part({ type: "text", text: "from the" }),
        part(picture("image/jpeg")),
        part({ type: "text", text: "market" }),
      ],
    });

    expect(toTurn(space, sent)).toMatchObject({ text: "from the market" });
    expect(toTurn(space, sent)).not.toHaveProperty("photo");
    expect(photoToLoad(sent)?.mimeType).toBe("image/jpeg");
  });

  it("says so when a message holds several pictures", () => {
    const sent = withContent({
      type: "group",
      items: [part(picture("image/jpeg")), part(picture("image/heic"))],
    });

    expect(toTurn(space, sent)).toMatchObject({
      text: "",
      photo: { status: "several" },
    });
    expect(photoToLoad(sent)).toBeNull();
  });

  it("reads the one picture among other files, and none when there is none", () => {
    const withVideo = withContent({
      type: "group",
      items: [part(picture("video/quicktime")), part(picture("image/heic"))],
    });
    expect(photoToLoad(withVideo)?.mimeType).toBe("image/heic");

    const onlyFiles = withContent({
      type: "group",
      items: [part(picture("application/pdf"))],
    });
    expect(toTurn(space, onlyFiles)).toMatchObject({
      photo: { status: "unsupported" },
    });
  });

  it("reads a group of words alone as text, and ignores an empty group", () => {
    expect(
      toTurn(
        space,
        withContent({
          type: "group",
          items: [part({ type: "text", text: "12 lunch" })],
        }),
      ),
    ).toMatchObject({ text: "12 lunch" });
    for (const items of [[], [part({ type: "reaction" })], [null, "x"], 7]) {
      expect(toTurn(space, withContent({ type: "group", items }))).toBeNull();
    }
  });

  it("reads a picture sent as a threaded reply", () => {
    const sent = withContent({
      type: "reply",
      content: picture("image/png"),
    });

    expect(toTurn(space, sent)).toMatchObject({ text: "" });
    expect(photoToLoad(sent)?.mimeType).toBe("image/png");
  });

  it("stays silent on a picture in a group chat or from the agent itself", () => {
    const sent = withContent(picture("image/jpeg"));

    expect(toTurn({ ...space, type: "group" }, sent)).toBeNull();
    expect(toTurn(space, { ...sent, direction: "outbound" })).toBeNull();
  });
});
