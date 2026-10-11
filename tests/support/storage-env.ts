// The Neon `storage-tests` branch's storage variables, for Vitest and
// Playwright (ADR-053). CI sets them from secrets; locally they come from
// .env.storage-tests (`neon env pull --branch storage-tests`). Only these
// five names are read from that file: it also holds the branch's
// DATABASE_URL, and tests always use the local Postgres.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export const STORAGE_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ENDPOINT_URL_S3",
  "AWS_REGION",
  "STATEMENTS_BUCKET",
] as const;

export function testStorageEnv(
  // Both configs run from the repository root; Playwright loads its config
  // as CommonJS, so `import.meta` is not available here.
  file = resolve(process.cwd(), ".env.storage-tests"),
  environment: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const values: Record<string, string> = {};
  for (const key of STORAGE_KEYS) {
    const value = environment[key] || fromFile[key];
    if (value) values[key] = value;
  }
  return values;
}
