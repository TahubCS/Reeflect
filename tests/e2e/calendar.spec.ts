import { type Locator, type Page, expect, test } from "@playwright/test";
import { SIGNED_IN_STATE, hydrated } from "./support";

// The dashboard runs on sample data pinned to Wednesday, October 7, 2026, so
// every figure below is fixed (src/features/cashflow/domain/demo-data.ts).

const headline = (page: Page): Locator =>
  page.getByRole("heading", { level: 1 });
const dayPanel = (page: Page): Locator =>
  page.getByRole("complementary", { name: "Selected day" });
const cell = (page: Page, date: string): Locator =>
  page.locator(`button[data-date="${date}"]`);

test.use({ storageState: SIGNED_IN_STATE });

test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard");
  await hydrated(page, "button[data-date]");
});

test("opens on today with the per-day headline and the sum behind it", async ({
  page,
}) => {
  await expect(headline(page)).toHaveText(
    "You can spend about $36.94 a day until payday.",
  );
  await expect(page.getByText("In your account today")).toBeVisible();
  await expect(dayPanel(page).getByRole("heading", { level: 2 })).toHaveText(
    "Wednesday, October 7",
  );
});

test("adding spending to today lowers the per-day headline", async ({
  page,
}) => {
  await dayPanel(page).getByLabel("How much?").fill("16");
  await dayPanel(page).getByLabel("What was it for?").fill("Bus pass");
  await dayPanel(page).getByRole("button", { name: "Add to Oct 7" }).click();

  await expect(headline(page)).toContainText("$34.94");
  await expect(dayPanel(page).getByText("Bus pass")).toBeVisible();
});

test("rejects an amount that is not a number", async ({ page }) => {
  await dayPanel(page).getByLabel("How much?").fill("lots");
  await dayPanel(page).getByRole("button", { name: "Add to Oct 7" }).click();

  await expect(dayPanel(page).getByRole("alert")).toHaveText(
    "Enter an amount like 12.50.",
  );
  await expect(headline(page)).toContainText("$36.94");
});

test("selecting a day shows its items, their source and the balance", async ({
  page,
}) => {
  await cell(page, "2026-10-02").click();

  const panel = dayPanel(page);
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText(
    "Friday, October 2",
  );
  await expect(panel.getByText("Corner Market")).toBeVisible();
  await expect(panel.getByText("Groceries, from your bank")).toBeVisible();
  await expect(panel.getByText("$670.13")).toBeVisible();
});

test("arrow keys move between days", async ({ page }) => {
  await cell(page, "2026-10-07").focus();
  await page.keyboard.press("ArrowRight");

  await expect(dayPanel(page).getByRole("heading", { level: 2 })).toHaveText(
    "Thursday, October 8",
  );
  await expect(cell(page, "2026-10-08")).toBeFocused();
});

test("filters the calendar to one kind", async ({ page }) => {
  const subscriptions = page
    .getByRole("group", { name: "Show" })
    .getByRole("button", { name: "Subscription" });

  await subscriptions.click();

  await expect(subscriptions).toHaveAttribute("aria-pressed", "true");
  await expect(cell(page, "2026-10-09")).toContainText("Streaming");
  await expect(cell(page, "2026-10-02")).not.toContainText("Corner Market");
});

test("switches between the calendar and the list", async ({ page }) => {
  const layout = page.getByRole("group", { name: "Layout" });

  await layout.getByRole("button", { name: "List" }).click();
  await expect(page.getByText("Arrow keys move between days.")).toBeHidden();
  await expect(page.locator("ol.agenda")).toBeVisible();

  await layout.getByRole("button", { name: "Calendar" }).click();
  await expect(page.getByText("Arrow keys move between days.")).toBeVisible();
});

test("marking a subscription shows a year's saving and offers no cancel action", async ({
  page,
}) => {
  const section = page.getByRole("region", { name: "Subscriptions" });

  await section.getByRole("button", { name: "Keeping" }).first().click();

  await expect(
    section.getByRole("button", { name: "Planning to cancel" }),
  ).toHaveCount(1);
  // Streaming is $15.49 a month.
  await expect(section.locator(".saving")).toContainText("$185.88");
  await expect(section.locator(".saving")).toContainText(
    "you cancel with the provider yourself",
  );
});

test("a text to the agent logs spending and updates the headline", async ({
  page,
}) => {
  const message = page.getByLabel("Message to Reeflect");

  await message.fill("spent 12 on lunch");
  await message.press("Enter");

  await expect(page.getByText("Logged $12.00 for Lunch.")).toBeVisible();
  // $295.54 less $12.00, over 8 days.
  await expect(headline(page)).toContainText("$35.44");
});
