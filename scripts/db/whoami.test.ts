import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { compareMigrations, readJournal } from "./inspect";
import { resolveTarget } from "./target";
import { formatState, formatTarget } from "./whoami";

const journal = [
  { tag: "0000_init", when: 100 },
  { tag: "0001_better_auth", when: 200 },
  { tag: "0002_synthetic_batches", when: 300 },
];

describe("compareMigrations", () => {
  it("splits the repo's migrations into applied and pending", () => {
    expect(compareMigrations(journal, [100, 200])).toEqual({
      applied: ["0000_init", "0001_better_auth"],
      pending: ["0002_synthetic_batches"],
      unknown: 0,
    });
  });

  it("counts recorded migrations this checkout does not have", () => {
    expect(compareMigrations(journal, [100, 150, 200, 300])).toEqual({
      applied: ["0000_init", "0001_better_auth", "0002_synthetic_batches"],
      pending: [],
      unknown: 1,
    });
  });

  it("reads the repo's journal, oldest first", () => {
    const tags = readJournal().map((e) => e.tag);
    expect(tags.slice(0, 2)).toEqual(["0000_init", "0001_better_auth"]);
  });
});

describe("formatTarget and formatState", () => {
  it("prints the endpoint and never the password", () => {
    const env = {
      DATABASE_URL:
        "postgresql://u:hunter2@ep-a-1-pooler.neon.tech/neondb?sslmode=require",
    };
    const text = formatTarget(resolveTarget("app", env), env).join("\n");
    expect(text).toContain("ep-a-1");
    expect(text).toContain("pooled connection");
    expect(text).not.toContain("hunter2");
  });

  it("describes pending and unknown migrations and the batch tables", () => {
    const lines = formatState({
      migrations: { applied: ["0000_init"], pending: ["0001_x"], unknown: 2 },
      batches: null,
      syntheticWorkspaces: null,
      workspaces: 4,
    });
    expect(lines).toEqual([
      "Migrations:  1 of 2 applied (last: 0000_init)",
      "             pending: 0001_x",
      "             plus 2 recorded migration(s) not in this checkout (a newer branch, or an old draft)",
      "Batches:     no synthetic_batch table yet",
      "Workspaces:  4 in total",
    ]);
    expect(
      formatState({
        migrations: { applied: [], pending: [], unknown: 0 },
        batches: 2,
        syntheticWorkspaces: 100,
        workspaces: 104,
      }).slice(0, 2),
    ).toEqual([
      "Migrations:  0 of 0 applied",
      "Batches:     2 synthetic batch(es), 100 synthetic workspace(s)",
    ]);
  });
});

describe("scripts/register-paths.ts", () => {
  it("lets plain node import src code by @/ and extensionless paths", () => {
    const out = execFileSync(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--import",
        "./scripts/register-paths.ts",
        "--input-type=module",
        "-e",
        // The schema index re-exports "./auth" with no extension.
        'const s = await import("@/lib/db/schema"); const m = await import("@/lib/money"); console.log(typeof s.syntheticBatch, m.formatCents(m.cents(1234)))',
      ],
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("object $12.34");
  });
});
