import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { GET, POST } from "./route";

// The token is set in vitest.config.mts. The run itself is tested in
// src/features/alerts; here only who may start one.

const TOKEN = "test-only-agent-service-token-0123456789";

vi.mock("@/features/alerts", () => ({
  runAlertsTick: vi.fn(async () => ({
    queued: 0,
    handled: 0,
    failedTargets: 0,
  })),
}));

const call = (
  handler: (request: Request) => Promise<Response>,
  method: string,
  authorization?: string,
) =>
  handler(
    new Request("http://localhost/api/jobs/tick", {
      method,
      headers: authorization ? { authorization } : {},
    }),
  );

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/jobs/tick", () => {
  it("looks like a missing route without the service token", async () => {
    const { runAlertsTick } = await import("@/features/alerts");
    for (const authorization of [undefined, "Bearer wrong", TOKEN]) {
      const response = await call(POST, "POST", authorization);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
    expect(runAlertsTick).not.toHaveBeenCalled();
  });

  it("runs once for the worker and answers with counts only", async () => {
    const response = await call(POST, "POST", `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      queued: 0,
      handled: 0,
      failedTargets: 0,
    });
  });

  it("refuses the cron GET while no cron secret is set, even with the worker's token", async () => {
    expect((await call(GET, "GET", `Bearer ${TOKEN}`)).status).toBe(404);
    expect((await call(GET, "GET")).status).toBe(404);
  });

  it("runs for Vercel Cron with its own secret", async () => {
    const cron = "test-only-cron-secret-0123456789";
    const saved = env.CRON_SECRET;
    Object.assign(env, { CRON_SECRET: cron });
    try {
      expect((await call(GET, "GET", `Bearer ${cron}`)).status).toBe(200);
      expect((await call(GET, "GET", `Bearer ${TOKEN}`)).status).toBe(404);
    } finally {
      Object.assign(env, { CRON_SECRET: saved });
    }
  });

  it("answers 500 without details when the run fails", async () => {
    const { runAlertsTick } = await import("@/features/alerts");
    vi.mocked(runAlertsTick).mockRejectedValueOnce(new Error("secret detail"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await call(POST, "POST", `Bearer ${TOKEN}`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "tick failed" });
  });
});
