import { describe, expect, it, vi } from "vitest";
import { NessieError, nessieClient } from "./api";

const KEY = "k".repeat(32);

function respond(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
      }),
  );
}

describe("nessieClient", () => {
  it("never puts the key in an error, even when fetch's own error has the URL", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async (url: string) => {
      throw new Error(`connect failed for ${url}`);
    });
    const api = nessieClient({ key: KEY, fetch: fetch as never });
    const pending = api.getAccount("a1").catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const error = await pending;
    vi.useRealTimers();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(NessieError);
    expect((error as Error).message).not.toContain(KEY);
    expect(JSON.stringify(error)).not.toContain(KEY);
  });

  it("reads a 404 list as empty and a missing account as null", async () => {
    const api = nessieClient({
      key: KEY,
      fetch: respond(404, "No transfers found") as never,
    });
    expect(await api.getAccount("gone")).toBeNull();
    expect(await api.customerAccounts("c1")).toEqual([]);
  });

  it("rejects a response of the wrong shape", async () => {
    const api = nessieClient({
      key: KEY,
      fetch: respond(200, [{ nope: true }]) as never,
    });
    await expect(api.customerAccounts("c1")).rejects.toThrow(NessieError);
  });

  it("returns a created record's id and reports failures without the key", async () => {
    const ok = nessieClient({
      key: KEY,
      fetch: respond(201, {
        code: 201,
        objectCreated: { _id: "new-1" },
      }) as never,
    });
    expect(await ok.createRecord("a1", "deposits", { amount: 1 })).toBe(
      "new-1",
    );
    const bad = nessieClient({
      key: KEY,
      fetch: respond(400, "status field required") as never,
    });
    const error = await bad
      .createRecord("a1", "deposits", {})
      .catch((e: unknown) => e);
    expect((error as NessieError).status).toBe(400);
    expect((error as Error).message).toContain("/accounts/a1/deposits");
    expect((error as Error).message).not.toContain(KEY);
  });

  it("refuses to start without a key", () => {
    expect(() => nessieClient({ key: "" })).toThrow();
  });
});
