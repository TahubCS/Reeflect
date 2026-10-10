import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findSecrets, scanBundle, secretsFromEnv } from "./scan-bundle";

const SECRET = { name: "GEMINI_API_KEY", value: "not-a-real-key-0123456789" };

describe("findSecrets", () => {
  it("finds nothing in ordinary bundle code", () => {
    expect(findSecrets('console.log("hello")', [SECRET])).toEqual([]);
  });

  it("reports a secret env value by name without printing the value", () => {
    const findings = findSecrets(`const k="${SECRET.value}"`, [SECRET]);

    expect(findings).toEqual(["value of GEMINI_API_KEY"]);
    expect(findings.join()).not.toContain(SECRET.value);
  });

  it("ignores values too short to tell apart from ordinary code", () => {
    const placeholder = { name: "PLAID_SECRET", value: "ci-dummy" };

    expect(findSecrets('const mode="ci-dummy"', [placeholder])).toEqual([]);
  });

  it("reports a private key", () => {
    const text = "-----BEGIN RSA PRIVATE KEY-----\nabc";

    expect(findSecrets(text, [])).toEqual(["private key"]);
  });

  it("reports a Google API key", () => {
    const text = `key=AIza${"a".repeat(35)}`;

    expect(findSecrets(text, [])).toEqual(["Google API key"]);
  });

  it("reports a database URL that carries a password", () => {
    const text = 'url="postgres://app:hunter2@db.example.com:5432/app"';

    expect(findSecrets(text, [])).toEqual(["database URL with password"]);
  });

  it("does not report a database URL without credentials", () => {
    expect(findSecrets('"postgres://localhost:5432/app"', [])).toEqual([]);
  });
});

describe("secretsFromEnv", () => {
  it("takes only the secret variables that are set", () => {
    const secrets = secretsFromEnv({
      CRON_SECRET: "cron-secret-value",
      NEXT_PUBLIC_ENABLE_PREVIEWS: "true",
      BETTER_AUTH_URL: "http://localhost:3000",
    });

    expect(secrets).toEqual([
      { name: "CRON_SECRET", value: "cron-secret-value" },
    ]);
  });
});

describe("scanBundle", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "scan-bundle-"));
    mkdirSync(join(directory, "chunks"));
    writeFileSync(join(directory, "chunks", "clean.js"), "export {};");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("passes a bundle with no secrets and counts its files", () => {
    expect(scanBundle(directory, [SECRET])).toEqual({
      filesScanned: 1,
      findings: [],
    });
  });

  it("names the file in a nested folder that contains a secret", () => {
    writeFileSync(join(directory, "chunks", "leak.js"), SECRET.value);

    const scan = scanBundle(directory, [SECRET]);

    expect(scan.filesScanned).toBe(2);
    expect(scan.findings).toHaveLength(1);
    expect(scan.findings[0]).toMatch(
      /^chunks[\\/]leak\.js: contains value of GEMINI_API_KEY$/,
    );
  });
});
