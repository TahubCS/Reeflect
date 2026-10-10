import "server-only";
import { z } from "zod";

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "must start with postgres:// or postgresql://");

// Every variable the app reads (ARCH-09). Add a variable here in the PR that
// first uses it, and to .env.example.
const envSchema = z.object({
  /** Runtime connection. On Neon, the pooled string (host contains "-pooler"). */
  DATABASE_URL: postgresUrl,
  /** Direct connection, used only by Drizzle Kit migrations. */
  DATABASE_URL_UNPOOLED: postgresUrl.optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(
  raw: Readonly<Record<string, string | undefined>>,
): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    // Names and reasons only: never echo a value, it may be a secret.
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `Invalid environment variables (${problems}). See .env.example.`,
    );
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
