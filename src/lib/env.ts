import "server-only";
import { z } from "zod";

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "must start with postgres:// or postgresql://");

/** An optional value where empty or blank counts as unset. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

// Every variable the app reads (ARCH-09). Add a variable here in the PR that
// first uses it, and to .env.example.
const envSchema = z
  .object({
    /** Runtime connection. On Neon, the pooled string (host contains "-pooler"). */
    DATABASE_URL: postgresUrl,
    /** Direct connection, used only by Drizzle Kit migrations. */
    DATABASE_URL_UNPOOLED: postgresUrl.optional(),
    /** Signs sessions and cookies (ADR-006). 32+ random characters. */
    BETTER_AUTH_SECRET: z.string().min(32),
    /** The app's public origin, e.g. http://localhost:3000. */
    BETTER_AUTH_URL: z.url(),
    /**
     * Better Auth Infrastructure dashboard key (ADR-047). Optional: without it
     * the dash plugin is left out, so tests and CI never call the service. An
     * empty value counts as unset.
     */
    BETTER_AUTH_API_KEY: optionalText,
    /**
     * Shared secret the agent worker sends to `/api/agent/turn` (ADR-032).
     * Optional: without it the endpoint answers 404 to everyone. An empty
     * value counts as unset.
     */
    AGENT_SERVICE_TOKEN: optionalText.pipe(z.string().min(32).optional()),
    /**
     * The number users text, shown on the Settings card (ADR-051). Optional:
     * on Photon's shared pool there may be no single number. E.164 format.
     */
    AGENT_PHONE_NUMBER: optionalText.pipe(
      z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/, "must look like +15551234567")
        .optional(),
    ),
    /**
     * Resend key for sign-up and password emails (ADR-052). Without it emails
     * are written to the local outbox instead of sent.
     */
    RESEND_API_KEY: optionalText,
    /** Sender on the Resend-verified domain, e.g. `Reeflect <no-reply@…>`. */
    EMAIL_FROM: optionalText,
    /** Set by Vercel on every deployment ("1"). */
    VERCEL: optionalText,
  })
  // A deployment must send real email: the local outbox is for development
  // and tests only (ADR-052).
  .superRefine((env, context) => {
    // Resend rejects a sender outside the verified domain.
    if (env.RESEND_API_KEY !== undefined && env.EMAIL_FROM === undefined) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "required when RESEND_API_KEY is set",
      });
    }
    if (env.VERCEL === undefined) return;
    for (const name of ["RESEND_API_KEY", "EMAIL_FROM"] as const) {
      if (env[name] === undefined) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "required on Vercel",
        });
      }
    }
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
