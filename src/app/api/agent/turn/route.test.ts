import { describe, expect, it } from "vitest";
import { REPLIES } from "@/features/agent/domain/replies";
import { POST } from "./route";

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

  it("answers a valid turn with a reply", async () => {
    const response = await post(turn, `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: REPLIES.signUp });
  });
});
