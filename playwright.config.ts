import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);
// Set PORT when something else (such as `pnpm dev`) already uses 3000.
const port = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

// E2E tests run against the production build: `pnpm build` first (TEST-01).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Signs up and verifies one shared user and saves its session
    // (tests/e2e/support.ts).
    { name: "setup", testMatch: /.*.setup.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `pnpm start -p ${port}`,
    url: baseURL,
    reuseExistingServer: !isCi,
    env: {
      // Never the Neon database from .env.local: the local or CI Postgres.
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://test:test@localhost:5433/app_test",
      // The server under test is always on localhost, whatever .env.local says.
      BETTER_AUTH_URL: baseURL,
      // Test sign-ups never reach the Better Auth dashboard (ADR-047). An
      // empty value wins over the key in .env.local.
      BETTER_AUTH_API_KEY: "",
      // Lets specs post turns as the agent worker would (tests/e2e/support.ts).
      AGENT_SERVICE_TOKEN: "e2e-only-agent-service-token-0123456789",
      // The link card must not depend on a number being configured.
      AGENT_PHONE_NUMBER: "",
      // No Resend key, so emails go to .email-outbox/ and tests follow the
      // links there (ADR-052). Empty values win over .env.local.
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      // S3Mock from docker-compose.yml, never Neon object storage (ADR-053).
      // These win over any AWS_* values in .env.local.
      AWS_ACCESS_KEY_ID: "test-access-key",
      AWS_SECRET_ACCESS_KEY: "test-secret-key",
      AWS_ENDPOINT_URL_S3:
        process.env.AWS_ENDPOINT_URL_S3 ?? "http://localhost:9100",
      AWS_REGION: "us-east-1",
      STATEMENTS_BUCKET: "statements",
    },
  },
});
