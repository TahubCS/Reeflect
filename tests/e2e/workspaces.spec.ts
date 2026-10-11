import { type Browser, type Page, expect, test } from "@playwright/test";
import { SIGNED_IN_STATE, signUpVerified } from "./support";

// F-02, the Personal part of TEST-07's workspaces suite (ADR-007). Household
// workspaces, invites and switching arrive later.

const WORKSPACE_DASHBOARD = /\/w\/([^/]+)\/dashboard$/;

/** Signs a new user up through the API in a fresh browser context. */
async function newSignedInPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Workspace Tester",
    email: `e2e-workspace-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

async function personalDashboardUrl(page: Page): Promise<string> {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(WORKSPACE_DASHBOARD);
  return page.url();
}

test("a new user lands in their Personal workspace", async ({
  browser,
  baseURL,
}) => {
  const page = await newSignedInPage(browser, baseURL);

  await personalDashboardUrl(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "a day until payday",
  );
});

test("a workspace-free URL opens the same workspace", async ({
  browser,
  baseURL,
}) => {
  const page = await newSignedInPage(browser, baseURL);
  const dashboard = await personalDashboardUrl(page);
  const workspaceId = WORKSPACE_DASHBOARD.exec(new URL(dashboard).pathname)![1];

  await page.goto("/accounts");

  await expect(page).toHaveURL(new RegExp(`/w/${workspaceId}/accounts$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accounts");
});

test.describe("another user's workspace", () => {
  test.use({ storageState: SIGNED_IN_STATE });

  test("is not found for someone who is not a member", async ({
    page,
    browser,
    baseURL,
  }) => {
    const owner = await newSignedInPage(browser, baseURL);
    const theirs = await personalDashboardUrl(owner);

    await page.goto(theirs);

    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByText("a day until payday")).toHaveCount(0);
  });
});

test("a workspace URL sends a signed-out visitor to sign in", async ({
  page,
}) => {
  await page.goto("/w/any-workspace/dashboard");

  await expect(page).toHaveURL(/\/sign-in$/);
});
