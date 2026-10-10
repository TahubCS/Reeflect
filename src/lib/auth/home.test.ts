import { afterEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const ensurePersonalWorkspace = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
);
vi.mock("./session", () => ({ getSession }));
vi.mock("./personal-workspace", () => ({ ensurePersonalWorkspace }));
vi.mock("next/navigation", () => ({ redirect }));

const { personalWorkspaceHref } = await import("./home");

afterEach(() => {
  vi.clearAllMocks();
});

describe("personalWorkspaceHref", () => {
  it("puts the path inside the user's Personal workspace", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    ensurePersonalWorkspace.mockResolvedValue("ws-1");

    await expect(personalWorkspaceHref("/accounts")).resolves.toBe(
      "/w/ws-1/accounts",
    );
    expect(ensurePersonalWorkspace).toHaveBeenCalledWith("user-1");
  });

  it("sends a signed-out visitor to sign in", async () => {
    getSession.mockResolvedValue(null);

    await expect(personalWorkspaceHref("/dashboard")).rejects.toThrow(
      "redirect:/sign-in",
    );
    expect(ensurePersonalWorkspace).not.toHaveBeenCalled();
  });
});
