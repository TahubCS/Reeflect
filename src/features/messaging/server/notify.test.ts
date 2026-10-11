import { afterEach, describe, expect, it, vi } from "vitest";
import { sendToPhone } from "./notify";

const TOKEN = "test-only-agent-service-token-0123456789";
const SPACE = "any;-;+15551234567";
const TEXT = "You're linked.";

afterEach(() => {
  vi.restoreAllMocks();
});

const send = (fetch: typeof globalThis.fetch, extra = {}) =>
  sendToPhone("imessage", SPACE, TEXT, {
    workerUrl: "https://worker.example.com",
    serviceToken: TOKEN,
    fetch,
    ...extra,
  });

describe("sendToPhone", () => {
  it("posts the text to the worker with the service token", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("sent"),
    );

    expect(await send(fetch)).toBe(true);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://worker.example.com/send");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      platform: "imessage",
      spaceId: SPACE,
      text: TEXT,
    });
  });

  it("sends nothing when the worker's address or the token is not set", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();

    expect(await send(fetch, { workerUrl: undefined })).toBe(false);
    expect(await send(fetch, { serviceToken: undefined })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is false, and logs no conversation or text, when the worker refuses", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await send(async () => new Response("not sent", { status: 502 })),
    ).toBe(false);

    const output = JSON.stringify(logged.mock.calls);
    expect(output).toContain("502");
    expect(output).not.toContain(SPACE);
    expect(output).not.toContain(TEXT);
    expect(output).not.toContain(TOKEN);
  });

  it("is false when the worker cannot be reached or is too slow", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await send(async () => {
        throw new TypeError("fetch failed");
      }),
    ).toBe(false);

    const slow: typeof globalThis.fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal!.reason),
        );
      });
    expect(await send(slow, { timeoutMs: 20 })).toBe(false);
  });
});
