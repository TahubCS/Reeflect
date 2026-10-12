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
  platformTimeoutMs?: number,
) =>
  runWorker(
    { messages: stream(pairs) },
    { appUrl: "https://app.example.com", serviceToken: TOKEN, fetch: app },
    platformTimeoutMs,
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

  it("ignores its own messages, group chats and tapbacks", async () => {
    const log: string[] = [];
    const dm = fakeSpace("alice", log, "dm");
    const group = fakeSpace("family", log, "group");

    await run([
      [dm, { ...text("m1", "+15551230001", "mine"), direction: "outbound" }],
      [group, text("m2", "+15551230001", "in a group")],
      [
        dm,
        { ...text("m3", "+15551230001", ""), content: { type: "reaction" } },
      ],
    ]);

    expect(log).toEqual([]);
    expect(echoApp).not.toHaveBeenCalled();
  });

  it("answers a swipe reply as the text inside it (HO-074)", async () => {
    const log: string[] = [];
    const space = fakeSpace("alice", log, "dm");

    await run([
      [
        space,
        {
          ...text("m1", "+15551230001", ""),
          content: { type: "reply", content: { type: "text", text: "2" } },
        },
      ],
    ]);

    expect(log).toContain('alice: sent "re: 2"');
  });

  it("does not let a send that hangs hold up the next text", async () => {
    const errorsLogged = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const log: string[] = [];
    let sends = 0;
    const space: ReplySpace = {
      ...fakeSpace("alice", log, "dm"),
      async send(content) {
        sends += 1;
        // The first send never settles, as a stuck platform call would.
        if (sends === 1) return new Promise(() => {});
        log.push(`alice: sent "${content}"`);
      },
    };

    await run(
      [
        [space, text("m1", "+15551230001", "one")],
        [space, text("m2", "+15551230001", "two")],
      ],
      echoApp,
      20,
    );

    expect(log).toContain('alice: sent "re: two"');
    expect(errorsLogged).toHaveBeenCalledWith("worker: reply not sent", {
      messageId: "m1",
      reason: "TimeoutError",
    });
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
