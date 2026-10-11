// `pnpm db:verify --target app|local|branch|production`: no repair or writes.
import { Agent } from "node:https";
import { parseArgs } from "node:util";
import { Client as NeonClient, neonConfig } from "@neondatabase/serverless";
import pg from "pg";
import WebSocket from "ws";
import { inspectSchema } from "./catalog";
import { FINANCIAL_CONTRACT } from "./contract";
import { compareMigrations, readJournal, type MigrationState } from "./inspect";
import { compareSchema, type SchemaIssue } from "./schema-check";
import {
  loadLocalEnv,
  parseTargetName,
  resolveTarget,
  TargetError,
} from "./target";
import { formatTarget } from "./whoami";

export type Verification = {
  issues: SchemaIssue[];
  migrations: MigrationState | null;
};

export async function verifyConnected(
  client: pg.Client | Pick<pg.Client, "query">,
): Promise<Verification> {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const issues = compareSchema(
      FINANCIAL_CONTRACT,
      await inspectSchema(client, FINANCIAL_CONTRACT),
    );
    let migrations: MigrationState | null = null;
    await client.query("SAVEPOINT journal_probe");
    try {
      const exists = await client.query<{ found: string | null }>(
        "SELECT to_regclass('drizzle.__drizzle_migrations') AS found",
      );
      const rows = exists.rows[0]?.found
        ? (
            await client.query<{ created_at: string }>(
              "SELECT created_at FROM drizzle.__drizzle_migrations",
            )
          ).rows
        : [];
      migrations = compareMigrations(
        readJournal(),
        rows.map((r) => Number(r.created_at)),
      );
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT journal_probe");
      if ((error as { code?: string }).code !== "42501") throw error;
    } finally {
      await client.query("RELEASE SAVEPOINT journal_probe");
    }
    await client.query("COMMIT");
    return { issues, migrations };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export function formatVerification(result: Verification): string[] {
  const lines = [
    result.issues.length
      ? "Schema: NOT READY"
      : "Schema: READY for this checkout's financial-page contract",
  ];
  for (const issue of result.issues)
    lines.push(`  ${issue.feature}: ${issue.object}: ${issue.problem}`);
  if (!result.migrations)
    lines.push(
      "Warning: migration journal is unreadable by this role; schema checks are independent.",
    );
  else {
    if (result.migrations.pending.length)
      lines.push(
        `Warning: unrecorded migrations: ${result.migrations.pending.join(", ")}. A later recovery may provide compatible schema.`,
      );
    if (result.migrations.unknown)
      lines.push(
        `Warning: ${result.migrations.unknown} migration timestamp(s) are outside this checkout.`,
      );
  }
  lines.push(
    "Checked SELECT access with zero-row queries. Write privileges were not checked.",
  );
  if (result.issues.length)
    lines.push(
      "Next: confirm the target/app role, inspect db:whoami and migration SQL; diagnose missing objects before any separately authorized migration. No repairs were attempted.",
    );
  return lines;
}

export function safeFailure(error: unknown): string {
  if (error instanceof TargetError)
    return "Verification refused: choose --target app, local, branch or production and check its configured connection variable.";
  if ((error as { code?: string } | null)?.code === "42501")
    return "Verification failed: permission denied. Check catalog/schema access for the intended app role.";
  return "Verification failed: connection or catalog query unavailable. Check target credentials, approved network access and timeouts. Driver details are suppressed.";
}

export async function runVerification(
  url: string,
  websocket = false,
): Promise<Verification> {
  if (websocket) {
    const agent = new Agent({ keepAlive: true, proxyEnv: process.env });
    neonConfig.webSocketConstructor = class extends WebSocket {
      constructor(address: string, protocols?: string | string[]) {
        super(address, protocols, { agent });
      }
    };
  }
  const Constructor = websocket ? NeonClient : pg.Client;
  const runtimeClient = new Constructor({
    connectionString: url,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  // An idle disconnect must not print an unhandled driver's error.
  runtimeClient.on("error", () => {});
  const client: Pick<pg.Client, "query" | "end"> & {
    connect(): Promise<unknown>;
  } = runtimeClient;
  try {
    await client.connect();
    return await verifyConnected(client);
  } finally {
    await client.end();
  }
}

async function main() {
  loadLocalEnv();
  const { values } = parseArgs({
    options: { target: { type: "string", default: "app" } },
  });
  const target = resolveTarget(parseTargetName(values.target), process.env);
  console.log(formatTarget(target, process.env).join("\n"));
  const result = await runVerification(
    target.url,
    target.name !== "local" && process.env.DATABASE_TRANSPORT === "websocket",
  );
  console.log(formatVerification(result).join("\n"));
  if (result.issues.length) process.exitCode = 1;
}
if (import.meta.main)
  main().catch((error: unknown) => {
    console.error(safeFailure(error));
    process.exitCode = 1;
  });
