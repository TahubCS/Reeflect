import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { readJournal } from "./inspect";

const migrationsFolder = "src/lib/db/migrations";
const journal = readJournal();
const original = journal.find((entry) => entry.tag === "0010_monthly_budgets")!;
const recoveryIndex = journal.findIndex(
  (entry) => entry.tag === "0012_budget_migration_recovery",
);
const recovery = journal[recoveryIndex]!;
// The unknown migration checkpoint observed in production, not a credential.
const incidentTimestamp = 1791698782168;

async function isolatedDatabase(run: (client: pg.Client) => Promise<void>) {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Migration regression tests require local PostgreSQL");
  }
  const name = `budget_repair_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  let created = false;
  let client: pg.Client | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = `/${name}`;
    client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    await run(client);
  } finally {
    try {
      await client?.end();
      if (created) await admin.query(`DROP DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
  }
}

async function migrateThrough(client: pg.Client, count: number) {
  const folder = mkdtempSync(join(tmpdir(), "budget-migrations-"));
  try {
    mkdirSync(join(folder, "meta"));
    const entries = journal.slice(0, count);
    writeFileSync(
      join(folder, "meta", "_journal.json"),
      JSON.stringify({ entries }),
    );
    for (const entry of entries) {
      copyFileSync(
        join(migrationsFolder, `${entry.tag}.sql`),
        join(folder, `${entry.tag}.sql`),
      );
    }
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

async function seedLedger(client: pg.Client) {
  await client.query(`
    INSERT INTO organization (id, name, slug, created_at)
      VALUES ('workspace', 'Migration test', 'migration-test', now()),
      ('other-workspace', 'Other test', 'other-migration-test', now());
    INSERT INTO category (id, workspace_id, name, sort_order, preset_key)
      VALUES ('groceries', 'workspace', 'Groceries', 1, 'groceries'),
      ('foreign-category', 'other-workspace', 'Groceries', 1, 'groceries');
    INSERT INTO financial_account (id, workspace_id, institution_name, type,
      nickname, source, current_balance_cents)
      VALUES ('account', 'workspace', 'Synthetic bank', 'checking',
      'Checking', 'synthetic', 48000);
    INSERT INTO transaction (id, workspace_id, financial_account_id,
      posted_on, amount_cents, description_raw, category_id, source, fingerprint)
      VALUES ('transaction', 'workspace', 'account', '2026-10-01', -2000,
      'Synthetic groceries', 'groceries', 'synthetic', 'migration-test');
  `);
}

async function ledgerSnapshot(client: pg.Client) {
  return {
    accounts: (
      await client.query("SELECT * FROM financial_account ORDER BY id")
    ).rows,
    categories: (await client.query("SELECT * FROM category ORDER BY id")).rows,
    transactions: (await client.query("SELECT * FROM transaction ORDER BY id"))
      .rows,
  };
}

async function insertAllocation(client: pg.Client) {
  await client.query(`
    INSERT INTO budget (id, workspace_id, category_id, month, amount_cents)
      VALUES ('allocation', 'workspace', 'groceries', '2026-10', 50000)
  `);
}

async function assertBudgetConstraints(client: pg.Client) {
  await expect(
    client.query("UPDATE budget SET amount_cents = -1"),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    client.query("UPDATE budget SET amount_cents = 10000000001"),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    client.query("UPDATE budget SET month = '2026-13'"),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    client.query(`INSERT INTO budget SELECT 'duplicate', workspace_id,
      category_id, month, amount_cents, created_at, updated_at FROM budget`),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    client.query("UPDATE budget SET category_id = 'foreign-category'"),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    client.query("UPDATE budget SET workspace_id = 'missing-workspace'"),
  ).rejects.toMatchObject({ code: "23503" });
}

describe("budget forward migration recovery", () => {
  it("migrates a fresh database and enforces the budget constraints", async () => {
    await isolatedDatabase(async (client) => {
      await migrate(drizzle(client), { migrationsFolder });
      await seedLedger(client);
      await insertAllocation(client);
      expect(
        (await client.query("SELECT amount_cents FROM budget")).rows,
      ).toEqual([{ amount_cents: "50000" }]);
      await assertBudgetConstraints(client);
    });
  });

  it("preserves existing allocations and ledger rows on a healthy upgrade", async () => {
    await isolatedDatabase(async (client) => {
      await migrateThrough(client, recoveryIndex);
      await seedLedger(client);
      await insertAllocation(client);
      const ledger = await ledgerSnapshot(client);
      const allocations = (await client.query("SELECT * FROM budget")).rows;
      await migrate(drizzle(client), { migrationsFolder });
      await migrate(drizzle(client), { migrationsFolder });
      expect(await ledgerSnapshot(client)).toEqual(ledger);
      expect((await client.query("SELECT * FROM budget")).rows).toEqual(
        allocations,
      );
    });
  });

  it("reproduces a successful but skipped 0010, then repairs forwards without changing history or ledger", async () => {
    await isolatedDatabase(async (client) => {
      await migrateThrough(client, 10);
      await seedLedger(client);
      const ledger = await ledgerSnapshot(client);
      expect(incidentTimestamp).toBeGreaterThan(original.when);
      expect(recovery.when).toBeGreaterThan(incidentTimestamp);
      await client.query(
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        ["unknown-migration-test", incidentTimestamp],
      );
      // This is the user's exact symptom: migrate succeeds but creates no table.
      await migrateThrough(client, recoveryIndex);
      expect(
        (await client.query("SELECT to_regclass('public.budget') AS table"))
          .rows,
      ).toEqual([{ table: null }]);
      const history = (
        await client.query(
          "SELECT * FROM drizzle.__drizzle_migrations ORDER BY id",
        )
      ).rows;

      await migrate(drizzle(client), { migrationsFolder });
      await insertAllocation(client);
      await assertBudgetConstraints(client);
      await migrate(drizzle(client), { migrationsFolder });
      expect(await ledgerSnapshot(client)).toEqual(ledger);
      const repairedHistory = (
        await client.query(
          "SELECT * FROM drizzle.__drizzle_migrations ORDER BY id",
        )
      ).rows;
      expect(repairedHistory.slice(0, history.length)).toEqual(history);
      // The recovery is the one row added after the incident; migrations
      // that come after it in the journal follow it.
      expect(repairedHistory).toHaveLength(
        history.length + journal.length - recoveryIndex,
      );
      expect(Number(repairedHistory[history.length].created_at)).toBe(
        recovery.when,
      );
      expect(
        (await client.query("SELECT amount_cents FROM budget")).rows,
      ).toEqual([{ amount_cents: "50000" }]);
    });
  });
});
