// Read-only look at a database: which migrations it has, compared with the
// repo, and how many synthetic batches it holds. Counts only, no row data.
import { readFileSync } from "node:fs";
import pg from "pg";

export type JournalEntry = { tag: string; when: number };

export type MigrationState = {
  /** Migrations in the repo that this database has applied. */
  applied: string[];
  /** Migrations in the repo that this database has not applied yet. */
  pending: string[];
  /** Migrations in the database that this checkout does not have (a newer branch ran them). */
  unknown: number;
};

export function readJournal(
  path = "src/lib/db/migrations/meta/_journal.json",
): JournalEntry[] {
  const journal = JSON.parse(readFileSync(path, "utf8")) as {
    entries: JournalEntry[];
  };
  return journal.entries.map(({ tag, when }) => ({ tag, when }));
}

/** Drizzle stores each migration's journal `when` as `created_at`. */
export function compareMigrations(
  journal: readonly JournalEntry[],
  appliedCreatedAt: readonly number[],
): MigrationState {
  const applied = new Set(appliedCreatedAt);
  const known = new Set(journal.map((entry) => entry.when));
  return {
    applied: journal.filter((e) => applied.has(e.when)).map((e) => e.tag),
    pending: journal.filter((e) => !applied.has(e.when)).map((e) => e.tag),
    unknown: appliedCreatedAt.filter((when) => !known.has(when)).length,
  };
}

export type DatabaseState = {
  migrations: MigrationState;
  /** Null when the table does not exist yet (migration 0002 not applied). */
  batches: number | null;
  syntheticWorkspaces: number | null;
  workspaces: number;
};

async function count(client: pg.Client, sql: string): Promise<number> {
  const result = await client.query<{ n: string }>(sql);
  return Number(result.rows[0]?.n ?? 0);
}

async function tableExists(client: pg.Client, name: string): Promise<boolean> {
  const result = await client.query<{ found: string | null }>(
    "select to_regclass($1) as found",
    [name],
  );
  return result.rows[0]?.found != null;
}

export async function inspectDatabase(
  url: string,
  journal: readonly JournalEntry[] = readJournal(),
): Promise<DatabaseState> {
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    const appliedRows = (await tableExists(
      client,
      "drizzle.__drizzle_migrations",
    ))
      ? (
          await client.query<{ created_at: string }>(
            "select created_at from drizzle.__drizzle_migrations",
          )
        ).rows.map((row) => Number(row.created_at))
      : [];
    const hasBatches = await tableExists(client, "public.synthetic_batch");
    return {
      migrations: compareMigrations(journal, appliedRows),
      batches: hasBatches
        ? await count(client, "select count(*) as n from synthetic_batch")
        : null,
      syntheticWorkspaces: hasBatches
        ? await count(client, "select count(*) as n from synthetic_workspace")
        : null,
      workspaces: (await tableExists(client, "public.organization"))
        ? await count(client, "select count(*) as n from organization")
        : 0,
    };
  } finally {
    await client.end();
  }
}
