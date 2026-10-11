import type { TurnRequest } from "@reeflect/agent-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_REPLY, relayTurn } from "./relay.ts";

const TOKEN = "worker-test-token-0123456789-0123456789";
const turn: TurnRequest = {
  platform: "imessage",
  handle: "+15551234567",
  spaceId: "any;-;+15551234567",
  messageId: "message-1",
  text: "how am I doing?",
};

/** A `fetch` that answers every call the same way and records the calls. */
function fakeFetch(answer: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => answer());
}

const relay = (fetchFake: typeof fetch, timeoutMs?: number) =>
  relayTurn(turn, {
    appUrl: "https://app.example.com",
    serviceToken: TOKEN,
    fetch: fetchFake,
    timeoutMs,
  });

const errors = () => vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("relayTurn", () => {
  it("posts the turn with the service token and returns the app's reply", async () => {
    const fetchFake = fakeFetch(() => Response.json({ reply: "All good." }));

    expect(await relay(fetchFake)).toBe("All good.");

    expect(fetchFake).toHaveBeenCalledOnce();
    const [url, init] = fetchFake.mock.calls[0]!;
    expect(String(url)).toBe("https://app.example.com/api/agent/turn");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(JSON.parse(String(init?.body))).toEqual(turn);
  });

  it("ignores a path on the app URL", async () => {
    const fetchFake = fakeFetch(() => Response.json({ reply: "Hi" }));

    await relayTurn(turn, {
      appUrl: "https://app.example.com/some/page/",
      serviceToken: TOKEN,
      fetch: fetchFake,
    });

    expect(String(fetchFake.mock.calls[0]![0])).toBe(
      "https://app.example.com/api/agent/turn",
    );
  });

  it("cuts a text that is longer than the app accepts", async () => {
    const fetchFake = fakeFetch(() => Response.json({ reply: "Hi" }));

    await relayTurn(
      { ...turn, text: "x".repeat(5000) },
      {
        appUrl: "https://app.example.com",
        serviceToken: TOKEN,
        fetch: fetchFake,
      },
    );

    const sent = JSON.parse(String(fetchFake.mock.calls[0]![1]?.body));
    expect(sent.text).toHaveLength(4000);
  });

  it("falls back when the app answers with an error", async () => {
    const logged = errors();

    for (const status of [400, 404, 500, 503]) {
      const fetchFake = fakeFetch(() => new Response(null, { status }));
      expect(await relay(fetchFake)).toBe(FALLBACK_REPLY);
    }
    expect(logged).toHaveBeenCalledWith("relay: turn failed", {
      messageId: "message-1",
      reason: "app answered 404",
    });
  });

  it("falls back when the reply is malformed", async () => {
    errors();

    for (const answer of [
      () => Response.json({ reply: "" }),
      () => Response.json({}),
      () => new Response("not json"),
    ]) {
      expect(await relay(fakeFetch(answer))).toBe(FALLBACK_REPLY);
    }
  });

  it("falls back when the app cannot be reached", async () => {
    errors();
    const fetchFake = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });

    expect(await relay(fetchFake)).toBe(FALLBACK_REPLY);
  });

  it("falls back when the app takes too long", async () => {
    const logged = errors();
    const fetchFake = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );

    expect(await relay(fetchFake, 20)).toBe(FALLBACK_REPLY);
    expect(logged).toHaveBeenCalledWith("relay: turn failed", {
      messageId: "message-1",
      reason: "TimeoutError",
    });
  });

  it("does not call the app for a turn the app would reject", async () => {
    errors();
    const fetchFake = fakeFetch(() => Response.json({ reply: "Hi" }));

    expect(
      await relayTurn(
        { ...turn, handle: "" },
        {
          appUrl: "https://app.example.com",
          serviceToken: TOKEN,
          fetch: fetchFake,
        },
      ),
    ).toBe(FALLBACK_REPLY);
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it("never logs the handle, the text or the token", async () => {
    const logged = errors();

    await relay(fakeFetch(() => new Response(null, { status: 500 })));
    await relay(fakeFetch(() => Response.json({})));

    const output = JSON.stringify(logged.mock.calls);
    expect(output).not.toContain(turn.handle);
    expect(output).not.toContain(turn.text);
    expect(output).not.toContain(TOKEN);
  });
});
