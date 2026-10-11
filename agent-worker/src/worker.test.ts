import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_REPLY } from "./relay.ts";
import type { IncomingMessage } from "./turn.ts";
import { type ReplySpace, runWorker } from "./worker.ts";

const TOKEN = "worker-test-token-0123456789-0123456789";

/** A stand-in for a Spectrum space that records what happens in it. */
function fakeSpace(id: string, log: string[], type?: string) {
  const space: ReplySpace = {
    id,
    type,
    async responding(fn) {
      log.push(`${id}: typing on`);
      try {
        return await fn();
      } finally {
        log.push(`${id}: typing off`);
      }
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
