import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keepAwake, startHealthServer } from "./health.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startHealthServer", () => {
  it("answers GET and HEAD /health, and nothing else", async () => {
    // Port 0 lets the system pick a free one.
    const server = await startHealthServer(0);
    const { port } = server.address() as AddressInfo;
    const at = (path: string) => `http://127.0.0.1:${port}${path}`;

    try {
      const get = await fetch(at("/health"));
      expect(get.status).toBe(200);
      expect(await get.text()).toBe("ok");

      const head = await fetch(at("/health"), { method: "HEAD" });
      expect(head.status).toBe(200);

      expect((await fetch(at("/"))).status).toBe(404);
      expect((await fetch(at("/send"), { method: "POST" })).status).toBe(404);
      expect((await fetch(at("/health"), { method: "POST" })).status).toBe(404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
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
