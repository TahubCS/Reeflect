import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { SendRequest } from "@reeflect/agent-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keepAwake, startServer } from "./server.ts";

const TOKEN = "test-only-worker-service-token-0123456789";
const SEND: SendRequest = {
  platform: "imessage",
  spaceId: "any;-;+15551234567",
  text: "You're linked.",
};

let server: Server | undefined;

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await new Promise((resolve) =>
    server ? server.close(resolve) : resolve(null),
  );
  server = undefined;
});

/** Starts the server on a free port and returns how to reach it. */
async function start(
  send = vi.fn<(request: SendRequest) => Promise<void>>(async () => {}),
) {
  // Port 0 lets the system pick a free one.
  server = await startServer(0, { serviceToken: TOKEN, send });
  const { port } = server.address() as AddressInfo;
  const at = (path: string) => `http://127.0.0.1:${port}${path}`;
  const post = (body: unknown, token: string | null = TOKEN) =>
    fetch(at("/send"), {
      method: "POST",
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { at, post, send };
}

describe("startServer: /health", () => {
  it("answers GET and HEAD /health, and nothing else", async () => {
    const { at } = await start();

    const get = await fetch(at("/health"));
    expect(get.status).toBe(200);
    expect(await get.text()).toBe("ok");

    const head = await fetch(at("/health"), { method: "HEAD" });
    expect(head.status).toBe(200);

    expect((await fetch(at("/"))).status).toBe(404);
    expect((await fetch(at("/send"))).status).toBe(404);
    expect((await fetch(at("/health"), { method: "POST" })).status).toBe(404);
  });
});

describe("startServer: POST /send", () => {
  it("sends what the app asks, once", async () => {
    const { post, send } = await start();

    const response = await post(SEND);

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(SEND);
  });

  it("looks like it does not exist without the service token", async () => {
    const { post, send } = await start();

    for (const token of [null, "", "wrong-token", `${TOKEN}x`]) {
      expect((await post(SEND, token)).status).toBe(404);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a body that is not a send request", async () => {
    const { post, send } = await start();
    const bad: unknown[] = [
      "not json",
      {},
      { ...SEND, platform: "telegram" },
      { ...SEND, spaceId: "" },
      { ...SEND, text: "   " },
      { ...SEND, text: "x".repeat(1001) },
      { ...SEND, text: "x".repeat(20_000) },
    ];

    for (const body of bad) {
      expect((await post(body)).status).toBe(400);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("answers 502 when the send fails, without logging what was sent", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { post } = await start(
      vi.fn(async () => {
        throw new TypeError("Target not allowed for this project");
      }),
    );

    const response = await post(SEND);

    expect(response.status).toBe(502);
    const output = JSON.stringify(logged.mock.calls);
    expect(output).toContain("TypeError");
    expect(output).not.toContain(SEND.spaceId);
    expect(output).not.toContain(SEND.text);
    expect(output).not.toContain("Target not allowed");
  });
});

describe("keepAwake", () => {
  it("calls the service's own /health on a timer until stopped", async () => {
    vi.useFakeTimers();
    const ping = vi.fn<typeof fetch>(async () => new Response(null));

    const stop = keepAwake("https://worker.example.com", 1000, ping);
    expect(ping).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2500);
    expect(ping).toHaveBeenCalledTimes(2);
    const [url, init] = ping.mock.calls[0]!;
    expect(String(url)).toBe("https://worker.example.com/health");
    expect(init?.method).toBe("HEAD");

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("survives a failed ping", async () => {
    vi.useFakeTimers();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const ping = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });

    const stop = keepAwake("https://worker.example.com", 1000, ping);
    await vi.advanceTimersByTimeAsync(2500);
    stop();

    expect(ping).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledWith("health: keep-awake ping failed");
  });
});
