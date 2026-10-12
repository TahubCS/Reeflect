import { describe, expect, it, vi } from "vitest";
import { REPLIES } from "@/features/agent/domain/replies";
import { POST } from "./route";

// One test makes the turn fail as a database error would; the rest run the
// real turn.
const failure = vi.hoisted(() => ({ next: null as Error | null }));
vi.mock("@/features/agent", async (original) => {
  const real = await original<typeof import("@/features/agent")>();
  return {
    ...real,
    runAgentTurn: async (
      ...args: Parameters<typeof real.runAgentTurn>
    ): ReturnType<typeof real.runAgentTurn> => {
      const error = failure.next;
      failure.next = null;
      if (error) throw error;
      return real.runAgentTurn(...args);
    },
  };
});

// The token is set in vitest.config.mts. The valid turn below comes from a
// phone that never linked, so it needs the database but leaves no rows.

const TOKEN = "test-only-agent-service-token-0123456789";

const turn = {
  platform: "imessage",
  handle: "+19990001111",
  spaceId: "any;-;+19990001111",
  messageId: "route-test",
  text: "how am I doing?",
};

function post(body: unknown, authorization?: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/agent/turn", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/agent/turn", () => {
  it("looks like a missing route without the service token", async () => {
    for (const authorization of [undefined, "Bearer wrong", TOKEN]) {
      const response = await post(turn, authorization);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
  });

  it("checks the token before reading the body", async () => {
    expect((await post("not json")).status).toBe(404);
  });

  it("rejects a malformed turn", async () => {
    for (const body of ["not json", {}, { ...turn, platform: "telegram" }]) {
      const response = await post(body, `Bearer ${TOKEN}`);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid turn" });
    }
  });

  it("logs no phone number when the turn fails (HO-115)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // A failed query's message lists its parameters, the handle among them.
    const error = new Error(
      `Failed query: select ... params: imessage,${turn.handle}`,
    );
    error.name = "DrizzleQueryError";
    failure.next = error;

    const response = await post(turn, `Bearer ${TOKEN}`);

    expect(response.status).toBe(500);
    expect(logged).toHaveBeenCalledWith("agent turn failed", {
      messageId: "route-test",
      reason: "DrizzleQueryError",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(turn.handle);
    logged.mockRestore();
  });

  it("answers a valid turn with a reply", async () => {
    const response = await post(turn, `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: REPLIES.signUp });
  });
});
