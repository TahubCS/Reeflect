import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testStorageEnv } from "./tests/support/storage-env";

const fromRoot = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      "server-only": fromRoot("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: [
      "src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
      "agent-worker/src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
    ],
    env: {
      // Tests never read .env.local, so they cannot reach the Neon database.
      // They use the database from `docker compose up -d`, or the CI service.
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://test:test@localhost:5433/app_test",
      BETTER_AUTH_SECRET: "test-only-not-a-real-secret-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
      AGENT_SERVICE_TOKEN: "test-only-agent-service-token-0123456789",
      // No worker, whatever the environment sets (CI names one): no unit
      // test asks a worker to text anyone.
      AGENT_WORKER_URL: "",
      // No Gemini key, whatever the environment sets (CI has a dummy one):
      // the agent then answers with replies built by code, and no unit
      // test can call Google (ADR-059).
      GEMINI_API_KEY: "",
      GEMINI_MODELS: "",
      // The Neon `storage-tests` branch's bucket (ADR-053), never
      // production's: from CI secrets or .env.storage-tests.
      ...testStorageEnv(),
    },
    coverage: {
      provider: "v8",
      // Routes and feature UI are covered by Playwright (TEST-02, TEST-07).
      include: [
        "src/**/*.{ts,tsx}",
        "scripts/**/*.ts",
        "agent-worker/src/**/*.ts",
        "packages/*/src/**/*.ts",
      ],
      exclude: [
        "src/app/**",
        "src/features/*/ui/**",
        "src/instrumentation.ts",
        // Command-line entry points: argument parsing and printing around
        // tested modules; checked by running them (TEST-03).
        "scripts/batch/cli.ts",
        "scripts/db/migrate-to.ts",
        "scripts/register-paths.ts",
        // The worker's entry point: reads the environment and connects to
        // Photon around tested modules; checked by running it.
        "agent-worker/src/index.ts",
        "src/lib/db/schema/**",
        "**/*.test.{ts,tsx}",
      ],
      // Thresholds from docs/TESTING.md, TEST-03.
      thresholds: {
        lines: 80,
        branches: 70,
        "src/lib/money/**": { lines: 100, branches: 100 },
        "src/features/*/domain/**": { lines: 95, branches: 90 },
        "src/lib/security/**": { lines: 95, branches: 90 },
        "src/lib/auth/**": { lines: 95, branches: 90 },
      },
    },
  },
});
