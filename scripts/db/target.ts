// Which database a script talks to. Scripts never guess: the target is named
// on the command line, and its endpoint id is printed before anything runs.
// Writing to production needs `--target production` *and* a matching
// NEON_PRODUCTION_ENDPOINT_ID (ADR-048).

export const TARGET_NAMES = ["app", "local", "branch", "production"] as const;
export type TargetName = (typeof TARGET_NAMES)[number];

/** The Docker database from docker-compose.yml (tests use the same one). */
export const LOCAL_DATABASE_URL =
  "postgres://test:test@localhost:5433/app_test";

export type Target = {
  name: TargetName;
  /** Which variable the URL came from, for the printout. */
  source: string;
  /** Connection string to use. Never print it: it holds the password. */
  url: string;
  /** Neon endpoint id (`ep-…`), or the host name off Neon. Safe to print. */
  endpoint: string;
  database: string;
  pooled: boolean;
};

type Env = Readonly<Record<string, string | undefined>>;

export class TargetError extends Error {}

export function describeUrl(url: string): {
  endpoint: string;
  database: string;
  pooled: boolean;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TargetError("The connection string is not a valid URL.");
  }
  const first = parsed.hostname.split(".")[0] ?? parsed.hostname;
  const pooled = first.endsWith("-pooler");
  return {
    endpoint: pooled ? first.slice(0, -"-pooler".length) : first,
    database: parsed.pathname.replace(/^\//, "") || "(default)",
    pooled,
  };
}

/** Neon's direct connection string for the same branch: drop `-pooler` from the host. */
export function directUrl(url: string): string {
  const parsed = new URL(url);
  const [first, ...rest] = parsed.hostname.split(".");
  if (first?.endsWith("-pooler")) {
    parsed.hostname = [first.slice(0, -"-pooler".length), ...rest].join(".");
  }
  return parsed.toString();
}

function make(
  name: TargetName,
  source: string,
  url: string | undefined,
  options: { direct: boolean },
): Target {
  if (!url) {
    throw new TargetError(
      `${source} is not set. Add it to .env.local (see .env.example).`,
    );
  }
  const finalUrl = verifiedSsl(options.direct ? directUrl(url) : url);
  return { name, source, url: finalUrl, ...describeUrl(finalUrl) };
}

/**
 * `pg` already treats `sslmode=require` as `verify-full` and warns about it
 * on every connection; say `verify-full` outright so scripts stay quiet.
 */
export function verifiedSsl(url: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.get("sslmode") === "require") {
    parsed.searchParams.set("sslmode", "verify-full");
  }
  return parsed.toString();
}

/**
 * The database for a target name:
 * - `app`: `DATABASE_URL`, exactly what `pnpm dev` would use (read-only use).
 * - `local`: the Docker database.
 * - `branch`: the Neon batch-testing branch.
 * - `production`: Neon production, through its direct connection.
 */
export function resolveTarget(name: TargetName, env: Env): Target {
  switch (name) {
    case "app":
      return make(name, "DATABASE_URL", env.DATABASE_URL, { direct: false });
    case "local":
      return make(name, "docker-compose.yml", LOCAL_DATABASE_URL, {
        direct: false,
      });
    case "branch":
      return env.DATABASE_URL_BATCHTESTINGBRANCH_UNPOOLED
        ? make(
            name,
            "DATABASE_URL_BATCHTESTINGBRANCH_UNPOOLED",
            env.DATABASE_URL_BATCHTESTINGBRANCH_UNPOOLED,
            { direct: false },
          )
        : make(
            name,
            "DATABASE_URL_BATCHTESTINGBRANCH",
            env.DATABASE_URL_BATCHTESTINGBRANCH,
            { direct: true },
          );
    case "production":
      return env.DATABASE_URL_UNPOOLED
        ? make(name, "DATABASE_URL_UNPOOLED", env.DATABASE_URL_UNPOOLED, {
            direct: false,
          })
        : make(name, "DATABASE_URL", env.DATABASE_URL, { direct: true });
  }
}

/** The production endpoint id, from NEON_PRODUCTION_ENDPOINT_ID. */
function productionEndpoint(env: Env): string | undefined {
  return env.NEON_PRODUCTION_ENDPOINT_ID?.trim() || undefined;
}

/**
 * Throws unless writing to this target is safe:
 * - `branch` must not be production.
 * - `production` must match NEON_PRODUCTION_ENDPOINT_ID, which must be set.
 * - `app` is never written to: name the database instead.
 */
export function assertWritable(target: Target, env: Env): void {
  const production = productionEndpoint(env);
  switch (target.name) {
    case "app":
      throw new TargetError(
        "Name the database to write to: --target branch, local or production.",
      );
    case "local":
      return;
    case "branch": {
      const known =
        production ??
        (env.DATABASE_URL ? describeUrl(env.DATABASE_URL).endpoint : undefined);
      if (known === target.endpoint) {
        throw new TargetError(
          `The batch-testing branch URL points at production (${target.endpoint}). Check DATABASE_URL_BATCHTESTINGBRANCH.`,
        );
      }
      return;
    }
    case "production":
      if (!production) {
        throw new TargetError(
          "Set NEON_PRODUCTION_ENDPOINT_ID in .env.local before writing to production.",
        );
      }
      if (production !== target.endpoint) {
        throw new TargetError(
          `--target production resolved to ${target.endpoint}, but NEON_PRODUCTION_ENDPOINT_ID is ${production}. Refusing.`,
        );
      }
  }
}

/** What a printout calls the database: "production", "batch-testing branch", … */
export function knownAs(target: Target, env: Env): string {
  if (target.name === "local") return "local Docker database";
  const production = productionEndpoint(env);
  const branch = env.DATABASE_URL_BATCHTESTINGBRANCH
    ? describeUrl(env.DATABASE_URL_BATCHTESTINGBRANCH).endpoint
    : undefined;
  if (production === target.endpoint) return "Neon production";
  if (branch === target.endpoint) return "Neon batch-testing branch";
  if (!production && target.name === "production") {
    return "Neon production (unverified: NEON_PRODUCTION_ENDPOINT_ID not set)";
  }
  return "unknown database";
}

export function parseTargetName(value: string | undefined): TargetName {
  if (value === undefined) {
    throw new TargetError(
      `Choose a database with --target (${TARGET_NAMES.join(", ")}).`,
    );
  }
  if (!(TARGET_NAMES as readonly string[]).includes(value)) {
    throw new TargetError(
      `Unknown target "${value}". Use one of: ${TARGET_NAMES.join(", ")}.`,
    );
  }
  return value as TargetName;
}

/** Loads .env.local the way drizzle.config.ts does; set variables win. */
export function loadLocalEnv(
  load: (path: string) => void = process.loadEnvFile,
): void {
  try {
    load(".env.local");
  } catch {
    // No .env.local: only variables already set are used.
  }
}
