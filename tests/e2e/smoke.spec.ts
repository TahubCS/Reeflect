import { expect, test } from "@playwright/test";

test("home page renders its main content", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("main")).toBeVisible();
});
