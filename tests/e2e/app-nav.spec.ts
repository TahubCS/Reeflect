import { expect, test } from "@playwright/test";
import { SIGNED_IN_STATE, hydrated } from "./support";

// Label, URL and page heading of each link in the signed-in header
// (src/config/nav.ts). The dashboard's heading is the calendar headline.
const PAGES = [
  ["Accounts", "/accounts"],
  ["Transactions", "/transactions"],
  ["Import", "/import"],
  ["Subscriptions", "/subscriptions"],
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
      await nav.getByRole("link", { name: label }).click();

      await expect(page).toHaveURL(new RegExp(`${url}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav.locator("[aria-current='page']")).toHaveCount(1);
    }

    await nav.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "a day until payday",
    );
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
