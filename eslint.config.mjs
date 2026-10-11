import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Other agents' checkouts of this repository; each lints itself.
    ".claude/worktrees/**",
  ]),
  {
    // Skipped and focused tests must not reach main (TEST-09).
    files: ["**/*.test.{ts,tsx}", "tests/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...["describe", "it", "test"].flatMap((object) =>
          ["only", "skip"].map((property) => ({
            object,
            property,
            message: "Remove .only and .skip before committing.",
          })),
        ),
      ],
    },
  },
]);

export default eslintConfig;
