import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navHref } from "./nav";

const APP_GROUP = join(process.cwd(), "src", "app", "(app)");
const WORKSPACE = join(APP_GROUP, "w", "[workspaceId]");

describe("NAV_ITEMS", () => {
  it.each(NAV_ITEMS)("$label has a page in the workspace", ({ segment }) => {
    expect(existsSync(join(WORKSPACE, segment, "page.tsx"))).toBe(true);
  });

  it.each(NAV_ITEMS)("$label has a workspace-free redirect", ({ segment }) => {
    expect(existsSync(join(APP_GROUP, segment, "page.tsx"))).toBe(true);
  });

  it("has no duplicate links or labels", () => {
    const segments = NAV_ITEMS.map((item) => item.segment);
    const labels = NAV_ITEMS.map((item) => item.label);

    expect(new Set(segments).size).toBe(segments.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("starts with the dashboard, where sign-in lands", () => {
    expect(NAV_ITEMS[0].segment).toBe("dashboard");
  });
});

describe("navHref", () => {
  it("links inside the current workspace", () => {
    expect(navHref("accounts", "ws_1")).toBe("/w/ws_1/accounts");
  });

  it("links to the redirect when no workspace is open", () => {
    expect(navHref("accounts")).toBe("/accounts");
  });
});
