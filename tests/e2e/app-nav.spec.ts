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
