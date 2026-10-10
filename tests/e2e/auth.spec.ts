import { type Page, expect, test } from "@playwright/test";
import { hydrated, ownClientAddress } from "./support";

const PASSWORD = "correct-horse-battery-staple";
const newEmail = (): string => `e2e-ui-${crypto.randomUUID()}@example.test`;

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders(ownClientAddress());
});

async function fillSignIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("the home page leads to sign up and sign in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Reeflect lives in your texts.",
  );
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Sign up free" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();

  await page.goto("/");
  await nav.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the dashboard sends a signed-out visitor to sign in", async ({
  page,
}) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("sign-up fills in an email passed from the landing page", async ({
  page,
}) => {
  await page.goto("/sign-up?email=sam%40example.test");

  // getByRole skips the hidden, filled-in form while it streams in, and
  // retries until it replaces the empty one.
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(
    "sam@example.test",
  );
  await expect(page.getByLabel("Password")).toHaveValue("");
});

test("sign-up explains what is wrong before anything is sent", async ({
  page,
}) => {
  await page.goto("/sign-up");
  await hydrated(page, "form");

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(
    page.getByText("Enter an email address like name@example.com."),
  ).toBeVisible();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up$/);
});

test("sign up, sign out, a wrong password, then sign in", async ({ page }) => {
  const email = newEmail();

  await page.goto("/sign-up");
  await hydrated(page, "form");
  await page.getByLabel("Your name").fill("Sam Rivera");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Signed up and signed in: the calendar opens.
  await expect(page).toHaveURL(/\/w\/[^/]+\/dashboard$/);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "a day until payday",
  );

  await hydrated(page, "button[data-date]");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  await hydrated(page, "form");

  await fillSignIn(page, email, "the-wrong-password");
  await expect(
    page.getByText("That email and password don't match."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);

  await fillSignIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/w\/[^/]+\/dashboard$/);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});
