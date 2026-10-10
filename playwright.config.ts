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
    // Signs up one shared user and saves its session (tests/e2e/signed-in.ts).
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
    },
  },
});
