import { expect, test } from "@playwright/test";
import { VERIFY_SUBJECT, emailedLink, ownClientAddress } from "./support";

// The Better Auth route handler against a real database. The sign-in pages
// (auth.spec.ts, TEST-07) arrive with the (auth) routes.
// Matches the port in playwright.config.ts.
const origin = `http://localhost:${process.env.PORT ?? "3000"}`;
// Its own client address, so its sign-ins never share a rate-limit
// allowance with specs running alongside it.
const headers = { origin, ...ownClientAddress() };

test("the auth handler is mounted", async ({ request }) => {
  const response = await request.get("/api/auth/ok");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test("sign up, verify the email, sign out, sign in, and a wrong password", async ({
  request,
}) => {
  const email = `e2e-${crypto.randomUUID()}@example.test`;
  const password = "correct-horse-battery-staple";
  const session = async () =>
    (await request.get("/api/auth/get-session", { headers })).json();
  const signIn = (withPassword: string) =>
    request.post("/api/auth/sign-in/email", {
      headers,
      data: { email, password: withPassword },
    });

  const signUp = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "E2E Test", email, password },
  });
  expect(signUp.status()).toBe(200);
  // No session until the email is confirmed (ADR-052).
  expect(await session()).toBeNull();

  const unverified = await signIn(password);
  expect(unverified.status()).toBe(403);
  expect((await unverified.json()).code).toBe("EMAIL_NOT_VERIFIED");

  // Opening the emailed link verifies the address and signs the user in.
  const link = await emailedLink(email, VERIFY_SUBJECT);
  expect((await request.get(link, { headers })).ok()).toBe(true);
  expect((await session())?.user).toMatchObject({
    email,
    emailVerified: true,
  });

  const signOut = await request.post("/api/auth/sign-out", {
    headers,
    data: {},
  });
  expect(signOut.status()).toBe(200);
  expect(await session()).toBeNull();

  expect((await signIn(password)).status()).toBe(200);
  expect((await session())?.user.email).toBe(email);

  expect((await signIn("not-the-password")).status()).toBe(401);
});

test("a tampered verification link signs nobody in", async ({ request }) => {
  const response = await request.get(
    "/api/auth/verify-email?token=not-a-real-token&callbackURL=%2Femail-verified",
    { headers, maxRedirects: 0 },
  );

  expect(response.status()).toBe(302);
  expect(response.headers().location).toMatch(
    /\/email-verified\?error=INVALID_TOKEN$/,
  );
});
