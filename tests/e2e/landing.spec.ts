import { expect, test } from "@playwright/test";

test("the landing page's email box carries the address to sign-up", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Email address").fill("sam@example.test");
  await page
    .getByRole("region", { name: "Start reflecting on your money." })
    .getByRole("button", { name: "Sign up free" })
    .click();

  await expect(page).toHaveURL(/\/sign-up\?email=sam%40example\.test$/);
  // getByRole skips the hidden, filled-in form while it streams in, and
  // retries until it replaces the empty one.
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(
    "sam@example.test",
  );
});

test("the section links jump to their sections", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "How it works" })
    .click();

  await expect(page).toHaveURL(/#how$/);
  await expect(
    page.getByRole("heading", { name: "Up and running in three steps." }),
  ).toBeInViewport();
});

test("with reduced motion, every demo is shown in full and stays still", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const conversation = page.getByRole("figure", {
    name: "An example conversation with Reeflect",
  });
  const lastReply = conversation.getByRole("listitem").nth(4);
  await expect(lastReply).toContainText("That leaves about $37.94 a day.");
  await expect(lastReply.getByRole("paragraph")).toHaveCSS("opacity", "1");

  const balanceAfter = page.getByRole("definition").filter({
    hasText: "$469.42",
  });
  await expect(balanceAfter.first()).toBeVisible();

  // The clock never starts, so nothing changes a few steps later.
  const before = await conversation.innerHTML();
  await page.waitForTimeout(1600);
  expect(await conversation.innerHTML()).toBe(before);
});

test("the demos explain themselves to screen readers", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("img", { name: /^Projected balance for October/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Transactions found in the statement" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^Calendar for October 4 to 17/ }),
  ).toBeVisible();
});

test("the landing page fits a 360px phone without sideways scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
