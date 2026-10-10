import "server-only";
import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ac, roles } from "./permissions";
import { ensurePersonalWorkspace } from "./personal-workspace";

/**
 * Runs after a new user's row is committed (ADR-007). A failure must not
 * fail the sign-up, which has already happened: the workspace is created
 * on the user's first visit instead (`personalWorkspaceHref`).
 */
export async function createPersonalWorkspace(user: {
  id: string;
}): Promise<void> {
  try {
    await ensurePersonalWorkspace(user.id);
  } catch (error) {
    console.error("sign-up: personal workspace not created", {
      userId: user.id,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

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
  databaseHooks: { user: { create: { after: createPersonalWorkspace } } },
  plugins: [
    organization({ ac, roles, creatorRole: "owner" }),
    // Better Auth Infrastructure dashboard (ADR-047), only when its key is
    // set. Activity tracking stays off: it would change the user table.
    ...(env.BETTER_AUTH_API_KEY
      ? [dash({ apiKey: env.BETTER_AUTH_API_KEY })]
      : []),
    // Lets server actions set auth cookies. Must stay the last plugin.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
