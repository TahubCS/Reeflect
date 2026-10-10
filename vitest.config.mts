import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Routes in src/app are thin and are covered by Playwright (TEST-07).
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      exclude: ["src/app/**", "**/*.test.{ts,tsx}"],
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
