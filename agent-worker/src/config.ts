import { z } from "zod";

/** https, or http to this machine (development). */
function isSafeOrigin(value: string): boolean {
  // Not a URL at all: `z.url()` already reports it.
  if (!URL.canParse(value)) return true;
  const url = new URL(value);
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

/** An optional value where empty or blank counts as unset. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const DEFAULT_PORT = 8787;

const configSchema = z
  .object({
    /** `terminal` is a local chat window for development; `imessage` is real. */
    AGENT_PROVIDER: optionalText.pipe(
      z.enum(["imessage", "terminal"]).default("terminal"),
    ),
    /** From the Photon dashboard. Needed for `imessage` only. */
    PHOTON_PROJECT_ID: optionalText,
    PHOTON_PROJECT_SECRET: optionalText,
    /** The app's origin, e.g. https://www.example.com. */
    /** https only, so the token never crosses the network in clear. */
    REEFLECT_URL: z.url().refine(isSafeOrigin, {
      message: "must use https (http only for localhost)",
    }),
    /**
     * Shared with the app, which answers 404 without it (ADR-032). Trimmed
     * as the app trims it, so a pasted newline does not break every turn.
     */
    AGENT_SERVICE_TOKEN: z.string().trim().min(32),
    /** Port for `/health`. Render sets it. */
    PORT: optionalText
      .transform((value) =>
        value === undefined ? DEFAULT_PORT : Number(value),
      )
      .pipe(z.number().int().min(1).max(65535)),
    /** This service's public URL, set by Render; used to keep it awake. */
    RENDER_EXTERNAL_URL: optionalText.pipe(z.url().optional()),
  })
  .superRefine((config, context) => {
    if (config.AGENT_PROVIDER !== "imessage") return;
    for (const name of [
      "PHOTON_PROJECT_ID",
      "PHOTON_PROJECT_SECRET",
    ] as const) {
      if (config[name] === undefined) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "required when AGENT_PROVIDER is imessage",
        });
      }
    }
  });

export type Config = z.infer<typeof configSchema>;

/** Reads the worker's settings, or throws naming what is wrong. */
export function parseConfig(
  raw: Readonly<Record<string, string | undefined>>,
): Config {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    // Names and reasons only: never echo a value, it may be a secret.
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `Invalid worker settings (${problems}). See agent-worker/.env.example.`,
    );
  }
  return result.data;
}
