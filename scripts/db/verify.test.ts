import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { FINANCIAL_CONTRACT } from "./contract";
import { compareSchema, type TableFacts } from "./schema-check";
import { readJournal } from "./inspect";
import { TargetError } from "./target";
import {
  formatVerification,
  runVerification,
  safeFailure,
  verifyConnected,
} from "./verify";

function compatible(): TableFacts[] {
  return FINANCIAL_CONTRACT.map((t) => ({
    ...structuredClone(t),
    readable: true,
    unique: t.unique.map((columns) => ({ columns, valid: true })),
    references: t.references.map((f) => ({
      ...f,
      validated: true,
      schema: "public",
    })),
  }));
}
describe("schema contract comparison", () => {
  it("accepts equivalent renamed/reordered uniqueness, owned references and extras without mutating inputs", () => {
    const facts = compatible();
    facts.forEach((t) =>
      t.unique.forEach((i) => (i.columns = [...i.columns].reverse())),
    );
    facts[0]!.columns.push({
      name: "future_column",
      type: "text",
      notNull: false,
    });
    const before = structuredClone(facts);
    expect(compareSchema(FINANCIAL_CONTRACT, facts)).toEqual([]);
    expect(facts).toEqual(before);
  });
  it("rejects missing tables, columns, nullability, types and invalid/partial uniqueness", () => {
    const facts = compatible().filter((t) => t.name !== "budget");
    const row = facts.find((t) => t.name === "transaction")!;
    row.columns = row.columns.filter((c) => c.name !== "transfer_pair_id");
    row.columns.find((c) => c.name === "amount_cents")!.type = "integer";
    row.columns.find((c) => c.name === "is_transfer")!.notNull = false;
    row.unique.forEach((i) => (i.valid = false));
    const issues = compareSchema(FINANCIAL_CONTRACT, facts);
    expect(issues.some((i) => i.object === "budget")).toBe(true);
    expect(
      issues.some((i) => i.object === "transaction.transfer_pair_id"),
    ).toBe(true);
    expect(issues.some((i) => i.object === "transaction.amount_cents")).toBe(
      true,
    );
    expect(issues.some((i) => i.object === "transaction.is_transfer")).toBe(
      true,
    );
    expect(issues.some((i) => i.problem.includes("uniqueness"))).toBe(true);
  });
  it("rejects unvalidated, wrong-schema and incorrect-delete ownership references and inaccessible reads", () => {
    const facts = compatible();
    const bill = facts.find((t) => t.name === "bill_payment")!;
    bill.readable = false;
    bill.references.forEach((f) => (f.validated = false));
    expect(
      compareSchema(FINANCIAL_CONTRACT, facts).some((i) =>
        i.problem.includes("cannot be read"),
      ),
    ).toBe(true);
    bill.references.forEach((f) => {
      f.validated = true;
      f.schema = "other";
    });
    expect(
      compareSchema(FINANCIAL_CONTRACT, facts).filter((i) =>
        i.problem.includes("reference"),
      ).length,
    ).toBe(bill.references.length);
    bill.references.forEach((f) => {
      f.schema = "public";
      f.onDelete = "restrict";
    });
    expect(
      compareSchema(FINANCIAL_CONTRACT, facts).some((i) =>
        i.problem.includes("reference"),
      ),
    ).toBe(true);
  });
});
describe("secret-safe diagnostics", () => {
  it("keeps journal warnings distinct from schema availability", () => {
    const text = formatVerification({
      issues: [],
      migrations: {
        applied: [],
        pending: ["0010_monthly_budgets"],
        unknown: 1,
      },
    }).join("\n");
    expect(text).toContain("Schema: READY");
    expect(text).toContain("later recovery");
    expect(text).toContain("outside this checkout");
    expect(text).toContain("Write privileges were not checked");
    expect(
      formatVerification({ issues: [], migrations: null }).join("\n"),
    ).toContain("journal is unreadable");
  });
  it("prints required feature/object and diagnostic steps on failure", () => {
    expect(
      formatVerification({
        issues: [
          {
            feature: "Budgets",
            object: "budget",
            problem: "required table is missing",
          },
        ],
        migrations: null,
      }).join("\n"),
    ).toMatch(/NOT READY[\s\S]*Budgets: budget[\s\S]*No repairs/);
  });
  it("suppresses arbitrary errors, including URLs, passwords and driver messages", () => {
    const secret = "postgres://name:private-secret@host/database";
    expect(safeFailure(new Error(secret))).not.toContain(secret);
    expect(safeFailure(null)).toContain("suppressed");
    expect(safeFailure({ code: "42501", message: secret })).toContain(
      "permission denied",
    );
    expect(safeFailure(new TargetError(secret))).not.toContain(secret);
    expect(safeFailure(new TargetError("Choose a target"))).toContain(
      "--target",
    );
  });
  it("bounds and closes a client even when connecting fails", async () => {
    const end = vi.fn();
    const connect = vi.fn().mockRejectedValue(new Error("private URL"));
    const Constructor = vi.spyOn(pg, "Client").mockImplementation(function () {
      return { connect, end, on: vi.fn() } as unknown as pg.Client;
    });
    try {
      await expect(
        runVerification("postgres://test:test@localhost:1/test"),
      ).rejects.toThrow("private URL");
      expect(Constructor).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionTimeoutMillis: 10000,
          query_timeout: 10000,
        }),
      );
      expect(end).toHaveBeenCalledOnce();
    } finally {
      Constructor.mockRestore();
    }
  });
});

async function isolated(
  run: (client: pg.Client, url: string) => Promise<void>,
) {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Readiness fault fixtures require local PostgreSQL");
  const name = `readiness_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  let client: pg.Client | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = `/${name}`;
    client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    await migrate(drizzle(client), {
      migrationsFolder: "src/lib/db/migrations",
    });
    await run(client, url.toString());
  } finally {
    try {
      await client?.end();
      if (created) await admin.query(`DROP DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
  }
}

describe("real PostgreSQL readiness", () => {
  it("is schema-ready and performs only read-only queries without touching facts or schema", async () => {
    await isolated(async (client) => {
      const before = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
      );
      const query = vi.spyOn(client, "query");
      const result = await verifyConnected(client);
      expect(result.issues).toEqual([]);
      expect(result.migrations?.pending).toEqual([]);
      const statements = query.mock.calls.map((args) => String(args[0]).trim());
      expect(statements[0]).toContain("READ ONLY");
      expect(
        statements.every((q) =>
          /^(SELECT|BEGIN|COMMIT|SET LOCAL|SAVEPOINT|RELEASE|ROLLBACK)/i.test(
            q,
          ),
        ),
      ).toBe(true);
      expect(statements.filter((q) => q.includes("LIMIT 0"))).toHaveLength(
        FINANCIAL_CONTRACT.length,
      );
      query.mockRestore();
      expect(
        (
          await client.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
          )
        ).rows,
      ).toEqual(before.rows);
      expect(
        (await client.query('SELECT count(*) AS count FROM "transaction"'))
          .rows[0]?.count,
      ).toBe("0");
    });
  });
  it.each(["budget", "recurring_series", "bill_cycle"])(
    "SELECT 1 succeeds while missing %s fails readiness",
    async (table) => {
      await isolated(async (client) => {
        await client.query(`DROP TABLE "${table}" CASCADE`);
        expect((await client.query("SELECT 1 AS connected")).rows[0]).toEqual({
          connected: 1,
        });
        expect(
          (await verifyConnected(client)).issues.some(
            (i) => i.object === table,
          ),
        ).toBe(true);
      });
    },
  );
  it.each([
    [
      'ALTER TABLE "transaction" DROP COLUMN transfer_pair_id',
      "transaction.transfer_pair_id",
    ],
    [
      'ALTER TABLE "transaction" ALTER COLUMN amount_cents TYPE numeric',
      "transaction.amount_cents",
    ],
    [
      'ALTER TABLE "transaction" ALTER COLUMN is_transfer DROP NOT NULL',
      "transaction.is_transfer",
    ],
    [
      "ALTER TABLE budget DROP CONSTRAINT budget_workspace_category_fk",
      "budget (workspace_id, category_id)",
    ],
    [
      "DROP INDEX budget_workspace_month_category_uidx",
      "budget (workspace_id, month, category_id)",
    ],
  ])("detects schema fault: %s", async (fault, object) => {
    await isolated(async (client) => {
      await client.query(fault);
      expect(
        (await verifyConnected(client)).issues.some((i) => i.object === object),
      ).toBe(true);
    });
  });
  it("accepts renamed constraints and compatible extras, but rejects unvalidated references", async () => {
    await isolated(async (client) => {
      await client.query(
        "ALTER TABLE budget RENAME CONSTRAINT budget_workspace_category_fk TO compatible_owned_category",
      );
      await client.query(
        "ALTER INDEX budget_workspace_month_category_uidx RENAME TO compatible_unique",
      );
      await client.query(
        "ALTER TABLE budget ADD COLUMN future_metadata text; CREATE TABLE future_feature (id text)",
      );
      expect((await verifyConnected(client)).issues).toEqual([]);
      await client.query(
        "ALTER TABLE budget DROP CONSTRAINT compatible_owned_category",
      );
      await client.query(
        "ALTER TABLE budget ADD CONSTRAINT unvalidated_owned_category FOREIGN KEY (workspace_id, category_id) REFERENCES category(workspace_id,id) ON DELETE CASCADE NOT VALID",
      );
      expect(
        (await verifyConnected(client)).issues.some(
          (i) => i.object === "budget (workspace_id, category_id)",
        ),
      ).toBe(true);
    });
  });
  it("does not accept a partial or failed concurrent unique index", async () => {
    await isolated(async (client) => {
      await client.query("DROP INDEX budget_workspace_month_category_uidx");
      await client.query(
        "CREATE UNIQUE INDEX partial_budget_unique ON budget(workspace_id,month,category_id) WHERE amount_cents > 0",
      );
      expect(
        (await verifyConnected(client)).issues.some(
          (i) => i.object === "budget (workspace_id, month, category_id)",
        ),
      ).toBe(true);
      await client.query("DROP INDEX partial_budget_unique");
      await client.query(
        "INSERT INTO organization(id,name,slug,created_at) VALUES('w','Synthetic','readiness-test',now())",
      );
      await client.query(
        "INSERT INTO category(id,workspace_id,name,sort_order,preset_key) VALUES('c','w','Synthetic',1,'test')",
      );
      await client.query(
        "INSERT INTO budget(id,workspace_id,category_id,month,amount_cents) VALUES('b1','w','c','2026-10',100),('b2','w','c','2026-10',200)",
      );
      await expect(
        client.query(
          "CREATE UNIQUE INDEX CONCURRENTLY invalid_budget_unique ON budget(workspace_id,month,category_id)",
        ),
      ).rejects.toMatchObject({ code: "23505" });
      expect(
        (
          await client.query(
            "SELECT indisvalid FROM pg_index WHERE indexrelid='invalid_budget_unique'::regclass",
          )
        ).rows[0]?.indisvalid,
      ).toBe(false);
      expect(
        (await verifyConnected(client)).issues.some(
          (i) => i.object === "budget (workspace_id, month, category_id)",
        ),
      ).toBe(true);
    });
  });
  it("requires zero-row read access, but treats journal access as diagnostic", async () => {
    await isolated(async (client) => {
      const role = `readiness_role_${randomUUID().replaceAll("-", "")}`;
      await client.query(`CREATE ROLE "${role}"`);
      try {
        await client.query(
          `GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`,
        );
        await client.query(`SET ROLE "${role}"`);
        const result = await verifyConnected(client);
        expect(result.issues).toEqual([]);
        expect(result.migrations).toBeNull();
        await client.query("RESET ROLE");
        await client.query(
          `REVOKE SELECT ON budget FROM "${role}"; SET ROLE "${role}"`,
        );
        expect(
          (await verifyConnected(client)).issues.some(
            (i) =>
              i.object === "budget" && i.problem.includes("cannot be read"),
          ),
        ).toBe(true);
      } finally {
        await client.query("RESET ROLE");
        await client.query(`DROP OWNED BY "${role}"; DROP ROLE "${role}"`);
      }
    });
  });
  it("accepts recovered schema despite a skipped timestamp and newer journal entries", async () => {
    await isolated(async (client) => {
      const original = readJournal().find(
        (e) => e.tag === "0010_monthly_budgets",
      )!;
      await client.query(
        "DELETE FROM drizzle.__drizzle_migrations WHERE created_at=$1",
        [original.when],
      );
      await client.query(
        "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('future-test',9999999999999)",
      );
      const result = await verifyConnected(client);
      expect(result.issues).toEqual([]);
      expect(result.migrations).toMatchObject({
        pending: [original.tag],
        unknown: 1,
      });
      await client.query("DROP TABLE budget CASCADE");
      expect(
        (await verifyConnected(client)).issues.some(
          (i) => i.object === "budget",
        ),
      ).toBe(true);
    });
  });
  it("runs the actual command against a disposable app target, and fails on missing schema", async () => {
    await isolated(async (client, url) => {
      const args = [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--import",
        "./scripts/register-paths.ts",
        "scripts/db/verify.ts",
        "--target",
        "app",
      ];
      const env = {
        ...process.env,
        DATABASE_URL: url,
        DATABASE_TRANSPORT: "tcp",
      };
      expect(
        execFileSync(process.execPath, args, { env, encoding: "utf8" }),
      ).toContain("Schema: READY");
      await client.query("DROP TABLE budget CASCADE");
      const failure = spawnSync(process.execPath, args, {
        env,
        encoding: "utf8",
      });
      expect(failure.status).toBe(1);
      expect(failure.stdout).toContain("Budgets: budget");
      expect(failure.stdout + failure.stderr).not.toContain(url);
      const unavailable = spawnSync(process.execPath, args, {
        env: {
          ...env,
          DATABASE_URL: "postgres://name:private-secret@127.0.0.1:1/test",
        },
        encoding: "utf8",
      });
      expect(unavailable.status).toBe(1);
      expect(unavailable.stderr).toContain(
        "connection or catalog query unavailable",
      );
      expect(unavailable.stderr).not.toContain("private-secret");
    });
  });
});
