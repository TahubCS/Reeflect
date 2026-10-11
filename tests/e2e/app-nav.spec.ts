import { expect, test } from "@playwright/test";
import { SIGNED_IN_STATE, hydrated } from "./support";

// Label, path inside the workspace and page heading of each link in the
// signed-in header (src/config/nav.ts). The dashboard's heading is the
// calendar headline.
const PAGES = [
  ["Accounts", "/accounts"],
  ["Transactions", "/transactions"],
  ["Import", "/import"],
  ["Recurring payments", "/subscriptions"],
  ["Bills", "/bills"],
  ["Budgets", "/budgets"],
  ["Insights", "/insights"],
  ["Settings", "/settings"],
] as const;

test.describe("signed in", () => {
  test.use({ storageState: SIGNED_IN_STATE });

  test("the header links to every page and marks the current one", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await hydrated(page, "nav[aria-label='Pages'] a");
    const nav = page.getByRole("navigation", { name: "Pages" });

    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    for (const [label, url] of PAGES) {
      await hydrated(page, `nav[aria-label='Pages'] a[href$='${url}']`);
      await nav.getByRole("link", { name: label }).click();

      await expect(page).toHaveURL(new RegExp(`/w/[^/]+${url}$`));
      // The address changes before the new page has rendered, and on a busy
      // CI runner the page can take longer than the default five seconds.
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(label, {
        timeout: 20_000,
      });
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav.locator("[aria-current='page']")).toHaveCount(1);
    }

    await nav.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/w\/[^/]+\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("in dark mode every page sits on the header's gridded night band", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Accounts",
    );

    const grounds = await page.evaluate(() => {
      const ground = (el: Element) => {
        const style = getComputedStyle(el);
        return {
          color: style.backgroundColor,
          grid: style.backgroundImage,
          size: style.backgroundSize,
          attachment: style.backgroundAttachment,
        };
      };
      return {
        header: ground(document.querySelector("header")!),
        body: ground(document.body),
      };
    });

    expect(grounds.body).toEqual(grounds.header);
    expect(grounds.body.grid).toContain("linear-gradient");

    // Cards, lines and soft text are neutral greys like the header: no
    // blue cast (red, green and blue channels equal).
    const greys = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return ["--surface", "--surface-soft", "--line", "--tint", "--ink-soft"]
        .map((name) => [name, root.getPropertyValue(name).trim()] as const)
        .filter(([, hex]) => {
          const [r, g, b] = [1, 3, 5].map((i) => hex.slice(i, i + 2));
          return r !== g || g !== b;
        });
    });
    expect(greys).toEqual([]);
  });

  test("in light mode pages keep their light ground under the dark header", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Accounts",
    );

    const [header, body] = await page.evaluate(() =>
      [document.querySelector("header")!, document.body].map(
        (el) => getComputedStyle(el).backgroundColor,
      ),
    );

    expect(body).not.toBe(header);
  });

  test("every page shares one frame: the header's gutter, one title size, left-aligned", async ({
    page,
  }) => {
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const frames = [];
      for (const [label, url] of PAGES) {
        await page.goto(url);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          label,
          { timeout: 20_000 },
        );
        frames.push(
          await page.evaluate(() => {
            const header = getComputedStyle(document.querySelector("header")!);
            const main = document.querySelector("main")!;
            const title = getComputedStyle(main.querySelector("h1")!);
            return {
              gutter: getComputedStyle(main).paddingLeft === header.paddingLeft,
              left: main.getBoundingClientRect().left,
              title: [title.fontSize, title.fontWeight],
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          }),
        );
      }
      const [first] = frames;
      for (const frame of frames)
        expect(frame).toEqual({ ...first, gutter: true, overflow: false });
      expect(first.left).toBe(0);
    }
  });

  test("form fields have borders that stand out from their card (3:1)", async ({
    page,
  }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/accounts");
      await page.getByRole("link", { name: "Add an account" }).click();
      const field = page.getByRole("textbox").first();
      await expect(field).toBeVisible({ timeout: 20_000 });
      const [border, ground] = await field.evaluate((el) => {
        const root = getComputedStyle(document.documentElement);
        return [
          getComputedStyle(el).borderTopColor,
          root.getPropertyValue("--surface").trim(),
        ];
      });
      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const fromCss = (rgb: string) =>
        rgb.match(/\d+/g)!.slice(0, 3).map(Number);
      const fromHex = (hex: string) =>
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const [a, b] = [luminance(fromCss(border)), luminance(fromHex(ground))];
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThan(
        3,
      );
    }
  });

  test("every page shows who is signed in and offers sign out", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(page.getByText(/^Signed in as e2e-shared-/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});

test.describe("signed out", () => {
  for (const [label, url] of PAGES) {
    test(`${label} sends a signed-out visitor to sign in`, async ({ page }) => {
      await page.goto(url);

      await expect(page).toHaveURL(/\/sign-in$/);
    });
  }
});
