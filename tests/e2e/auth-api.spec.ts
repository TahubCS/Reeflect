import { expect, test } from "@playwright/test";

// The Better Auth route handler against a real database. The sign-in pages
// (auth.spec.ts, TEST-07) arrive with the (auth) routes.
const origin = "http://localhost:3000";
const headers = { origin };

test("the auth handler is mounted", async ({ request }) => {
  const response = await request.get("/api/auth/ok");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test("sign up, sign out, sign in, and a wrong password", async ({
  request,
}) => {
  const email = `e2e-${crypto.randomUUID()}@example.test`;
  const password = "correct-horse-battery-staple";
  const session = async () =>
    (await request.get("/api/auth/get-session", { headers })).json();

  const signUp = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "E2E Test", email, password },
  });
  expect(signUp.status()).toBe(200);
  expect((await session())?.user.email).toBe(email);

  const signOut = await request.post("/api/auth/sign-out", {
    headers,
    data: {},
  });
  expect(signOut.status()).toBe(200);
  expect(await session()).toBeNull();

  const signIn = await request.post("/api/auth/sign-in/email", {
    headers,
    data: { email, password },
  });
  expect(signIn.status()).toBe(200);
  expect((await session())?.user.email).toBe(email);

  const wrong = await request.post("/api/auth/sign-in/email", {
    headers,
    data: { email, password: "not-the-password" },
  });
  expect(wrong.status()).toBe(401);
});
