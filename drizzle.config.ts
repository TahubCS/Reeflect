import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// CI sets DATABASE_URL directly; locally it comes from .env.local.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./src/lib/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
