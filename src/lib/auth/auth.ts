import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { ac, roles } from "./permissions";

const env = serverEnv();

// Better Auth (ADR-006): email and password now, Google sign-in later. A
// workspace is an organization (ADR-007).
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  // On by default in production. Stored in the database because in-memory
  // counters are per serverless instance (ARCH-08).
  rateLimit: { storage: "database" },
  plugins: [
    organization({ ac, roles, creatorRole: "owner" }),
    // Lets server actions set auth cookies. Must stay the last plugin.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
