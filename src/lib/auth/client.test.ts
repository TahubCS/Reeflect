import { describe, expect, it } from "vitest";
import { authClient } from "./client";

describe("authClient", () => {
  it("exposes email sign-in and the workspace (organization) API", () => {
    expect(typeof authClient.signIn.email).toBe("function");
    expect(typeof authClient.signUp.email).toBe("function");
    expect(typeof authClient.signOut).toBe("function");
    expect(typeof authClient.organization.create).toBe("function");
  });
});
