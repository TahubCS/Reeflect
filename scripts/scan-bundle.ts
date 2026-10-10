// `pnpm scan:bundle`: after `pnpm build`, fails when the client bundle in
// .next/static contains a secret (docs/TESTING.md, TEST-06).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Environment variables marked "Secret: Yes" in docs/ARCHITECTURE.md, ARCH-09. */
export const SECRET_ENV_NAMES = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "BETTER_AUTH_SECRET",
  "ENCRYPTION_KEY",
  "PLAID_SECRET",
  "GEMINI_API_KEY",
  "NESSIE_API_KEY",
  "AGENT_SERVICE_TOKEN",
  "PHOTON_PROJECT_SECRET",
  "CRON_SECRET",
] as const;

// Shorter values (CI placeholders such as "ci-dummy") would match ordinary code.
const MIN_SECRET_LENGTH = 12;

const SECRET_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  {
    name: "database URL with password",
    pattern: /postgres(?:ql)?:\/\/[^\s:/"']+:[^\s@"']+@/,
  },
];

export type SecretValue = { readonly name: string; readonly value: string };

/** Returns one finding per secret found. Findings name the secret, never its value. */
export function findSecrets(
  text: string,
  secrets: readonly SecretValue[],
): string[] {
  const findings: string[] = [];
  for (const { name, value } of secrets) {
    if (value.length >= MIN_SECRET_LENGTH && text.includes(value)) {
      findings.push(`value of ${name}`);
    }
  }
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) findings.push(name);
  }
  return findings;
}

export function secretsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): SecretValue[] {
  return SECRET_ENV_NAMES.flatMap((name) => {
    const value = env[name];
    return value === undefined ? [] : [{ name, value }];
  });
}

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

export type BundleScan = {
  readonly filesScanned: number;
  /** One line per secret found: the file and what it contains. */
  readonly findings: readonly string[];
};

export function scanBundle(
  bundleDirectory: string,
  secrets: readonly SecretValue[],
): BundleScan {
  const files = listFiles(bundleDirectory);
  const findings = files.flatMap((file) =>
    findSecrets(readFileSync(file, "utf8"), secrets).map(
      (finding) => `${relative(bundleDirectory, file)}: contains ${finding}`,
    ),
  );
  return { filesScanned: files.length, findings };
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const bundle = join(root, ".next", "static");
  if (!existsSync(bundle)) {
    console.error(
      "scan:bundle: .next/static not found. Run `pnpm build` first.",
    );
    process.exitCode = 1;
    return;
  }
  const scan = scanBundle(bundle, secretsFromEnv(process.env));
  if (scan.findings.length > 0) {
    for (const finding of scan.findings) console.error(finding);
    console.error(`\nscan:bundle failed: ${scan.findings.length} finding(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`scan:bundle passed: ${scan.filesScanned} file(s) scanned`);
}

const entry = process.argv[1];
if (
  entry !== undefined &&
  relative(entry, fileURLToPath(import.meta.url)) === ""
) {
  main();
}
