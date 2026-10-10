import { describe, expect, it } from "vitest";
import { roleAtLeast, strongestRole } from "./roles";

describe("strongestRole", () => {
  it("reads a single workspace role", () => {
    expect(strongestRole("owner")).toBe("owner");
    expect(strongestRole("editor")).toBe("editor");
    expect(strongestRole("viewer")).toBe("viewer");
  });

  it("picks the strongest of several comma-separated roles", () => {
    expect(strongestRole("viewer, owner")).toBe("owner");
    expect(strongestRole("editor,viewer")).toBe("editor");
  });

  it("grants nothing for unknown roles, Better Auth's default or names on Object", () => {
    expect(strongestRole("member")).toBeNull();
    expect(strongestRole("")).toBeNull();
    expect(strongestRole("toString")).toBeNull();
    expect(strongestRole("Owner")).toBeNull();
  });
});

describe("roleAtLeast", () => {
  it("orders viewer < editor < owner", () => {
    expect(roleAtLeast("owner", "editor")).toBe(true);
    expect(roleAtLeast("editor", "editor")).toBe(true);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("editor", "owner")).toBe(false);
  });
});
