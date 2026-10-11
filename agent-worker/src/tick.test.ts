import { afterEach, describe, expect, it, vi } from "vitest";
import { startTicking } from "./tick.ts";

const TOKEN = "test-only-worker-service-token-0123456789";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startTicking", () => {
  it("posts to the app's tick route with the token, on a timer", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("{}"),
    );

    const stop = startTicking({
      appUrl: "https://app.example.com",
      serviceToken: TOKEN,
      intervalMs: 1000,
      fetch,
    });
    expect(fetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2500);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://app.example.com/api/jobs/tick");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not start a tick while the last one is still running", async () => {
    vi.useFakeTimers();
    let finish: (response: Response) => void = () => {};
    const fetch = vi.fn<typeof globalThis.fetch>(
      () => new Promise((resolve) => (finish = resolve)),
    );

    const stop = startTicking({
      appUrl: "https://app.example.com",
      serviceToken: TOKEN,
      intervalMs: 1000,
      fetch,
    });
    await vi.advanceTimersByTimeAsync(3500);
    expect(fetch).toHaveBeenCalledTimes(1);

    finish(new Response("{}"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    stop();
  });

  it("logs a failure by status or error name, and keeps ticking", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue(new Response("{}"));

    const stop = startTicking({
      appUrl: "https://app.example.com",
      serviceToken: TOKEN,
      intervalMs: 1000,
      fetch,
    });
    await vi.advanceTimersByTimeAsync(3500);
    stop();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith("tick: app answered", { status: 500 });
    expect(log).toHaveBeenCalledWith("tick: app not reached", {
      reason: "TypeError",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
  });
});
