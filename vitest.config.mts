import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    env: {
      // Tests never read .env.local, so they cannot reach Neon. They use the
      // database from `docker compose up -d`, or the CI service.
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://test:test@localhost:5433/app_test",
    },
    coverage: {
      provider: "v8",
      // Routes in src/app are thin and are covered by Playwright (TEST-07).
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      exclude: [
        "src/app/**",
        "src/instrumentation.ts",
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
