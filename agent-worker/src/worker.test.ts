import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_REPLY } from "./relay.ts";
import type { IncomingMessage } from "./turn.ts";
import { type ReplySpace, failure, runWorker } from "./worker.ts";

const TOKEN = "worker-test-token-0123456789-0123456789";

/** A stand-in for a Spectrum space that records what happens in it. */
function fakeSpace(id: string, log: string[], type?: string) {
  const space: ReplySpace = {
    id,
    type,
    async startTyping() {
      log.push(`${id}: typing on`);
    },
    async stopTyping() {
      log.push(`${id}: typing off`);
    },
    async send(content) {
      log.push(`${id}: sent "${content}"`);
    },
  };
  return space;
}

const text = (id: string, sender: string, body: string): IncomingMessage => ({
  id,
  platform: "imessage",
  direction: "inbound",
  content: { type: "text", text: body },
  sender: { id: sender },
});

async function* stream(pairs: [ReplySpace, IncomingMessage][]) {
  yield* pairs;
}

/** An app that echoes the text it was sent. */
const echoApp = vi.fn<typeof fetch>(async (_url, init) => {
  const { text: body } = JSON.parse(String(init?.body));
  return Response.json({ reply: `re: ${body}` });
});

const run = (
  pairs: [ReplySpace, IncomingMessage][],
  app: typeof fetch = echoApp,
) =>
  runWorker(
    { messages: stream(pairs) },
    { appUrl: "https://app.example.com", serviceToken: TOKEN, fetch: app },
  );

afterEach(() => {
  vi.restoreAllMocks();
  echoApp.mockClear();
});

describe("runWorker", () => {
  it("shows typing, asks the app and sends the reply", async () => {
    const log: string[] = [];
    const space = fakeSpace("alice", log, "dm");

    await run([[space, text("m1", "+15551230001", "hello")]]);

    expect(log).toEqual([
      "alice: typing on",
      'alice: sent "re: hello"',
      "alice: typing off",
    ]);
  });

  it("answers one conversation in order and never mixes conversations", async () => {
    const log: string[] = [];
    const alice = fakeSpace("alice", log, "dm");
    const bob = fakeSpace("bob", log, "dm");

    await run([
      [alice, text("m1", "+15551230001", "one")],
      [bob, text("m2", "+15551230002", "hi")],
      [alice, text("m3", "+15551230001", "two")],
    ]);

    const sentIn = (id: string) =>
      log.filter((line) => line.startsWith(`${id}: sent`));
    expect(sentIn("alice")).toEqual([
      'alice: sent "re: one"',
      'alice: sent "re: two"',
    ]);
    expect(sentIn("bob")).toEqual(['bob: sent "re: hi"']);
  });

  it("ignores its own messages, group chats and non-text content", async () => {
    const log: string[] = [];
    const dm = fakeSpace("alice", log, "dm");
    const group = fakeSpace("family", log, "group");

    await run([
      [dm, { ...text("m1", "+15551230001", "mine"), direction: "outbound" }],
      [group, text("m2", "+15551230001", "in a group")],
      [
        dm,
        { ...text("m3", "+15551230001", ""), content: { type: "attachment" } },
      ],
    ]);

    expect(log).toEqual([]);
    expect(echoApp).not.toHaveBeenCalled();
  });

  it("downloads a picture and hands it to the app in the same turn", async () => {
    const log: string[] = [];
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
    const seen: unknown[] = [];
    const app = vi.fn<typeof fetch>(async (_url, init) => {
      seen.push(JSON.parse(String(init?.body)));
      return Response.json({ reply: "read it" });
    });

    await run(
      [
        [
          fakeSpace("alice", log, "dm"),
          {
            ...text("m1", "+15551230001", ""),
            content: {
              type: "attachment",
              mimeType: "image/jpeg",
              size: bytes.length,
              read: async () => bytes,
            },
          },
        ],
      ],
      app,
    );

    expect(seen).toEqual([
      {
        platform: "imessage",
        handle: "+15551230001",
        spaceId: "alice",
        messageId: "m1",
        text: "",
        photo: {
          status: "attached",
          mimeType: "image/jpeg",
          data: Buffer.from(bytes).toString("base64"),
        },
      },
    ]);
    expect(log).toEqual([
      "alice: typing on",
      'alice: sent "read it"',
      "alice: typing off",
    ]);
  });

  it("tells the app when a picture could not be carried, logging ids only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const log: string[] = [];
    const seen: { photo?: unknown }[] = [];
    const app = vi.fn<typeof fetch>(async (_url, init) => {
      seen.push(JSON.parse(String(init?.body)));
      return Response.json({ reply: "could not read it" });
    });
    const picture = (id: string, content: IncomingMessage["content"]) => ({
      ...text(id, "+15551230001", ""),
      content,
    });

    await run(
      [
        [
          fakeSpace("alice", log, "dm"),
          picture("m1", {
            type: "attachment",
            mimeType: "image/jpeg",
            read: async () => {
              throw new Error("no such chat +15551230001");
            },
          }),
        ],
        [
          fakeSpace("alice", log, "dm"),
          picture("m2", { type: "attachment", mimeType: "application/pdf" }),
        ],
      ],
      app,
    );

    expect(seen.map((turn) => turn.photo)).toEqual([
      { status: "unavailable" },
      { status: "unsupported" },
    ]);
    expect(log.filter((line) => line.includes("sent"))).toHaveLength(2);
    expect(logged).toHaveBeenCalledWith("worker: photo not forwarded", {
      messageId: "m1",
      status: "unavailable",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("+15551230001");
  });

  it("sends the fallback when the app fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const log: string[] = [];
    const broken = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 500 }),
    );

    await run(
      [[fakeSpace("alice", log, "dm"), text("m1", "+1555", "hello")]],
      broken,
    );

    expect(log).toContain(`alice: sent "${FALLBACK_REPLY}"`);
  });

  it("still sends the reply when the typing indicator is refused", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const log: string[] = [];
    const space = fakeSpace("alice", log, "dm");
    // What Photon's client throws: a named error with a fixed code.
    const refused = Object.assign(new Error("chat +15551230001 not ready"), {
      name: "ValidationError",
      code: "preconditionFailed",
    });
    space.startTyping = async () => {
      throw refused;
    };
    space.stopTyping = async () => {
      throw refused;
    };

    await run([[space, text("m1", "+15551230001", "hello")]]);

    expect(log).toEqual(['alice: sent "re: hello"']);
    // Said once, with the code, and never the error's own words.
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("worker: typing indicator refused", {
      messageId: "m1",
      reason: "ValidationError",
      code: "preconditionFailed",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("+15551230001");
  });

  it("hides the typing indicator again when the reply cannot be sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const log: string[] = [];
    const space = fakeSpace("alice", log, "dm");
    space.send = async () => {
      throw new Error("line unavailable");
    };

    await run([[space, text("m1", "+15551230001", "hello")]]);

    expect(log).toEqual(["alice: typing on", "alice: typing off"]);
  });

  it("keeps going when a reply cannot be sent, logging ids only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const log: string[] = [];
    const failing = fakeSpace("alice", log, "dm");
    failing.send = async () => {
      throw new Error("line unavailable");
    };
    const working = fakeSpace("bob", log, "dm");

    await run([
      [failing, text("m1", "+15551230001", "secret question")],
      [working, text("m2", "+15551230002", "hi")],
    ]);

    expect(log).toContain('bob: sent "re: hi"');
    expect(logged).toHaveBeenCalledWith("worker: reply not sent", {
      messageId: "m1",
      reason: "Error",
    });
    const output = JSON.stringify(logged.mock.calls);
    expect(output).not.toContain("+15551230001");
    expect(output).not.toContain("secret question");
  });
});

describe("failure", () => {
  it("gives the name, and the code only when it is a word", () => {
    expect(failure(new TypeError("fetch failed"))).toEqual({
      reason: "TypeError",
    });
    expect(
      failure(Object.assign(new Error("x"), { code: "dailyLimitExceeded" })),
    ).toEqual({ reason: "Error", code: "dailyLimitExceeded" });
    expect(failure(Object.assign(new Error("x"), { code: 9 }))).toEqual({
      reason: "Error",
    });
    expect(failure("boom")).toEqual({ reason: "unknown" });
    expect(failure(null)).toEqual({ reason: "unknown" });
  });
});
