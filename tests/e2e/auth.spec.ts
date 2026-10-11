import { type Page, expect, test } from "@playwright/test";
import {
  RESET_SUBJECT,
  VERIFY_SUBJECT,
  emailCount,
  emailedLink,
  hydrated,
  ownClientAddress,
  signUpVerified,
} from "./support";

const PASSWORD = "correct-horse-battery-staple";
const newEmail = (): string => `e2e-ui-${crypto.randomUUID()}@example.test`;

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders(ownClientAddress());
});

async function fillSignIn(page: Page, email: string, password: string) {
  // By role and exact label: Next keeps the previous page in the DOM, hidden,
  // and its fields would match too.
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
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

test("sign up, confirm the email, sign out, a wrong password, then sign in", async ({
  page,
}) => {
  const email = newEmail();

  await page.goto("/sign-up");
  await hydrated(page, "form");
  await page.getByLabel("Your name").fill("Sam Rivera");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Signed up, not signed in: the account opens from the emailed link.
  await expect(
    page.getByRole("heading", { name: "Check your inbox" }),
  ).toBeVisible();
  await expect(page.getByText(`We sent a link to ${email}`)).toBeVisible();

  await page.goto(await emailedLink(email, VERIFY_SUBJECT));
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

test("signing in before confirming sends a fresh link", async ({
  page,
  baseURL,
}) => {
  const email = newEmail();
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL ?? "", ...ownClientAddress() },
    data: { name: "Sam Rivera", email, password: PASSWORD },
  });
  expect(response.status()).toBe(200);
  await emailedLink(email, VERIFY_SUBJECT);
  const before = await emailCount(email, VERIFY_SUBJECT);

  await page.goto("/sign-in");
  await hydrated(page, "form");
  await fillSignIn(page, email, PASSWORD);

  await expect(
    page.getByText(
      "Confirm your email first. We've sent a new link to your inbox.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto(await emailedLink(email, VERIFY_SUBJECT, { after: before }));
  await expect(page).toHaveURL(/\/w\/[^/]+\/dashboard$/);
});

test("the check-your-inbox screen sends the link again", async ({ page }) => {
  const email = newEmail();

  await page.goto("/sign-up");
  await hydrated(page, "form");
  await page.getByLabel("Your name").fill("Sam Rivera");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await emailedLink(email, VERIFY_SUBJECT);
  const before = await emailCount(email, VERIFY_SUBJECT);

  await page.getByRole("button", { name: "Send the link again" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "Sent. Check your inbox again.",
  );
  await emailedLink(email, VERIFY_SUBJECT, { after: before });
});

test("forgot password: reset by email, then sign in with the new one", async ({
  page,
  baseURL,
}) => {
  const email = newEmail();
  const newPassword = "a-brand-new-passphrase";
  await signUpVerified(page.request, baseURL, {
    name: "Sam Rivera",
    email,
    password: PASSWORD,
  });
  await page.context().clearCookies();

  await page.goto("/sign-in");
  await hydrated(page, "form");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();
  await hydrated(page, "form");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText(`If ${email} has an account, we've sent it a link`),
  ).toBeVisible();

  await page.goto(await emailedLink(email, RESET_SUBJECT));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await hydrated(page, "form");
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(
    page.getByRole("heading", { name: "Password changed" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await hydrated(page, "form");
  await fillSignIn(page, email, PASSWORD);
  await expect(
    page.getByText("That email and password don't match."),
  ).toBeVisible();
  await fillSignIn(page, email, newPassword);
  await expect(page).toHaveURL(/\/w\/[^/]+\/dashboard$/);
});

test("asking to reset an unknown address looks the same", async ({ page }) => {
  const email = newEmail();

  await page.goto("/forgot-password");
  await hydrated(page, "form");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(
    page.getByText(`If ${email} has an account, we've sent it a link`),
  ).toBeVisible();
});

test("a bad reset link explains itself and offers a new one", async ({
  page,
}) => {
  await page.goto(
    "/api/auth/reset-password/not-a-real-token?callbackURL=%2Freset-password",
  );

  await expect(page).toHaveURL(/\/reset-password\?error=INVALID_TOKEN$/);
  await expect(
    page.getByRole("heading", { name: "That reset link has expired" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Send a new link" }),
  ).toHaveAttribute("href", "/forgot-password");
});

test("a bad verification link explains itself and offers sign-in", async ({
  page,
}) => {
  await page.goto("/email-verified?error=TOKEN_EXPIRED");

  await expect(
    page.getByRole("heading", { name: "We couldn't confirm your email" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "That link has expired. Sign in and we'll send you a new one.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
});
