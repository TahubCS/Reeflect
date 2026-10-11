import { defineConfig, devices } from "@playwright/test";
import { testStorageEnv } from "./tests/support/storage-env";

// Apply this to the runner too: specs that seed data construct their own
// pg pools, outside the webServer environment below.
if (
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).hostname.endsWith(".neon.tech")
) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5433/app_test";
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
}

const isCi = Boolean(process.env.CI);
// Set PORT when something else (such as `pnpm dev`) already uses 3000.
const port = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${port}`;
// Stands in for the agent worker: tests/support/stand-in-worker.ts.
const workerPort = process.env.STAND_IN_WORKER_PORT ?? "8799";
const workerURL = `http://localhost:${workerPort}`;
const serviceToken = "e2e-only-agent-service-token-0123456789";

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
  webServer: [
    {
      command: "node tests/support/stand-in-worker.ts",
      url: `${workerURL}/health`,
      reuseExistingServer: !isCi,
      env: {
        STAND_IN_WORKER_PORT: workerPort,
        AGENT_SERVICE_TOKEN: serviceToken,
      },
    },
    {
      command: `pnpm start -p ${port}`,
      url: baseURL,
      reuseExistingServer: !isCi,
      env: {
        // Never the Neon database from .env.local: the local or CI Postgres.
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgres://test:test@localhost:5433/app_test",
        DATABASE_TRANSPORT: "tcp",
        // The server under test is always on localhost, whatever .env.local says.
        BETTER_AUTH_URL: baseURL,
        // Test sign-ups never reach the Better Auth dashboard (ADR-047). An
        // empty value wins over the key in .env.local.
        BETTER_AUTH_API_KEY: "",
        // Lets specs post turns as the agent worker would (tests/e2e/support.ts).
        AGENT_SERVICE_TOKEN: serviceToken,
        // Texts the app sends first go to the stand-in worker, never a phone.
        AGENT_WORKER_URL: workerURL,
        // The link card must not depend on a number being configured.
        AGENT_PHONE_NUMBER: "",
        // No Resend key, so emails go to .email-outbox/ and tests follow the
        // links there (ADR-052). Empty values win over .env.local.
        // No Gemini key, so the agent's replies are the ones built by code and
        // tests never call Google (ADR-059). Empty wins over .env.local.
        GEMINI_API_KEY: "",
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
        // The Neon `storage-tests` branch's bucket, never production's
        // (ADR-053): from CI secrets or .env.storage-tests. These win over
        // any storage values in .env.local.
        ...testStorageEnv(),
      },
    },
  ],
});
