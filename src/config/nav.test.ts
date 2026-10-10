import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "./nav";

const APP_GROUP = join(process.cwd(), "src", "app", "(app)");

describe("NAV_ITEMS", () => {
  it.each(NAV_ITEMS)("$label links to a page that exists", ({ href }) => {
    expect(existsSync(join(APP_GROUP, href, "page.tsx"))).toBe(true);
  });

  it("has no duplicate links or labels", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    const labels = NAV_ITEMS.map((item) => item.label);

    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("starts with the dashboard, where sign-in lands", () => {
    expect(NAV_ITEMS[0].href).toBe("/dashboard");
  });
});
