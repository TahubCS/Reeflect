import { describe, expect, it } from "vitest";
import { editor, owner, roles, viewer } from "./permissions";

// ARCH-04: viewer reads; editor also writes; only owner manages members and
// deletes the workspace.
describe("workspace roles", () => {
  it("defines exactly owner, editor and viewer (ADR-007)", () => {
    expect(Object.keys(roles).sort()).toEqual(["editor", "owner", "viewer"]);
  });

  it("lets every role read data", () => {
    for (const role of [owner, editor, viewer]) {
      expect(role.authorize({ data: ["read"] }).success).toBe(true);
    }
  });

  it("lets owner and editor write data, but not viewer", () => {
    expect(owner.authorize({ data: ["write"] }).success).toBe(true);
    expect(editor.authorize({ data: ["write"] }).success).toBe(true);
    expect(viewer.authorize({ data: ["write"] }).success).toBe(false);
  });

  it("lets only owner invite, change roles or delete the workspace", () => {
    const ownerOnly = [
      { invitation: ["create"] },
      { member: ["update"] },
      { organization: ["delete"] },
    ] as const;

    for (const request of ownerOnly) {
      expect(owner.authorize(request).success).toBe(true);
      expect(editor.authorize(request).success).toBe(false);
      expect(viewer.authorize(request).success).toBe(false);
    }
  });
});
