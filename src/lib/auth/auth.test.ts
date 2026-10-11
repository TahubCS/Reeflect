import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: headersMock }));

// Every test here loads Better Auth afresh (`vi.resetModules` below), which
// can take longer than the default 5 seconds when the whole suite runs.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/app_test");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-only-not-a-real-secret-0123456789");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("auth", () => {
  it("enables email and password sign-in with database rate limits", async () => {
    const { auth } = await import("./auth");

    expect(auth.options.baseURL).toBe("http://localhost:3000");
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(auth.options.rateLimit?.storage).toBe("database");
  });

  it("uses the organization plugin for workspaces, with nextCookies last", async () => {
    const { auth } = await import("./auth");
    const ids = auth.options.plugins.map((plugin) => plugin.id);

    expect(ids).toContain("organization");
    expect(ids.at(-1)).toBe("next-cookies");
  });

  it("leaves the dashboard plugin out when there is no key", async () => {
    vi.stubEnv("BETTER_AUTH_API_KEY", "");
    const { auth } = await import("./auth");

    expect(auth.options.plugins.map((plugin) => plugin.id)).not.toContain(
      "dash",
    );
  });

  it("adds the dashboard plugin when its key is set, keeping nextCookies last", async () => {
    vi.stubEnv("BETTER_AUTH_API_KEY", "test-only-dashboard-key");
    const { auth } = await import("./auth");
    const ids = auth.options.plugins.map((plugin) => plugin.id);

    expect(ids).toContain("dash");
    expect(ids.at(-1)).toBe("next-cookies");
  });

  it("creates the Personal workspace after a user is created (ADR-007)", async () => {
    const ensure = vi.fn().mockResolvedValue("ws-1");
    vi.doMock("./personal-workspace", () => ({
      ensurePersonalWorkspace: ensure,
    }));
    const { auth } = await import("./auth");

    await auth.options.databaseHooks?.user?.create?.after?.({ id: "user-1" });

    expect(ensure).toHaveBeenCalledWith("user-1");
    vi.doUnmock("./personal-workspace");
  });

  it("logs, without failing the sign-up, when the workspace cannot be made", async () => {
    vi.doMock("./personal-workspace", () => ({
      ensurePersonalWorkspace: vi.fn().mockRejectedValue(new Error("down")),
    }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createPersonalWorkspace } = await import("./auth");

    await expect(
      createPersonalWorkspace({ id: "user-1" }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "sign-up: personal workspace not created",
      {
        userId: "user-1",
        message: "down",
      },
    );
    vi.doUnmock("./personal-workspace");
  });

  it("refuses to load without its environment", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");

    await expect(import("./auth")).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe("getSession", () => {
  it("passes the request headers to Better Auth", async () => {
    const requestHeaders = new Headers({ cookie: "a=b" });
    headersMock.mockResolvedValue(requestHeaders);
    const { auth } = await import("./auth");
    const getSessionSpy = vi
      .spyOn(auth.api, "getSession")
      .mockResolvedValue(null);
    const { getSession } = await import("./session");

    await expect(getSession()).resolves.toBeNull();
    expect(getSessionSpy).toHaveBeenCalledWith({ headers: requestHeaders });
  });
});
