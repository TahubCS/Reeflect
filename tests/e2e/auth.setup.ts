import { test as setup } from "@playwright/test";
import { SIGNED_IN_STATE, signUpVerified } from "./support";

// Signs one test user up through the API, verifies their email from the
// outbox (ADR-052) and saves the session, so specs for signed-in pages share
// it instead of each signing up. Sign-up is rate-limited, and auth.spec.ts
// covers the sign-up form itself.
setup("sign up the shared test user", async ({ request, baseURL }) => {
  await signUpVerified(request, baseURL, {
    name: "Calendar Tester",
    email: `e2e-shared-${crypto.randomUUID()}@example.test`,
  });

  await request.storageState({ path: SIGNED_IN_STATE });
});
