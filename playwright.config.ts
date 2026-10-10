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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start -p ${port}`,
    url: baseURL,
    reuseExistingServer: !isCi,
    env: {
      // Never the Neon database from .env.local: the local or CI Postgres.
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://test:test@localhost:5433/app_test",
    },
  },
});
