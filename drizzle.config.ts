import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Drizzle Kit runs outside Next.js, so load .env.local ourselves. An explicit
// DATABASE_URL (CI, or a local test database) wins: then the file is not read
// at all, so its Neon URLs cannot be picked up by accident.
if (process.env.DATABASE_URL === undefined && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// Migrations need a direct connection; Neon's pooler can break them.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (url === undefined) {
  throw new Error(
    "Set DATABASE_URL_UNPOOLED (or DATABASE_URL) before running Drizzle Kit. See .env.example.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./src/lib/db/migrations",
  dbCredentials: { url },
  strict: true,
});
