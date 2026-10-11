import { expect, test } from "@playwright/test";
import { SIGNED_IN_STATE } from "./support";

test.use({ storageState: SIGNED_IN_STATE });

test("the first Tab offers to skip the header and lands in the page", async ({
  page,
}) => {
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accounts");

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  // Focus moved past the header's wordmark, Sync, Sign out and page tabs.
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("#content")),
  ).toBe(true);
});
