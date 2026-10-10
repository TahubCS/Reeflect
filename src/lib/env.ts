import "server-only";
import { z } from "zod";

// Server environment variables (ARCH-09). Each feature adds its own variables
// here in the PR that starts using them.
const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Validates `source`. The error names the bad variables but never their values. */
export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((i) => i.path.join("."))),
    ];
    throw new Error(
      `Missing or invalid environment variables: ${names.join(", ")}. See .env.example.`,
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
