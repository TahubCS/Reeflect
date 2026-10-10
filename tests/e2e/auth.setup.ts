import { expect, test as setup } from "@playwright/test";
import { SIGNED_IN_STATE, ownClientAddress } from "./support";

// Signs one test user up through the API and saves the session, so specs for
// signed-in pages share it instead of each signing up. Sign-up is
// rate-limited, and auth.spec.ts covers the sign-up form itself.
setup("sign up the shared test user", async ({ request, baseURL }) => {
  const response = await request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL ?? "", ...ownClientAddress() },
    data: {
      name: "Calendar Tester",
      email: `e2e-shared-${crypto.randomUUID()}@example.test`,
      password: "correct-horse-battery-staple",
    },
  });

  expect(response.status()).toBe(200);
  await request.storageState({ path: SIGNED_IN_STATE });
});
