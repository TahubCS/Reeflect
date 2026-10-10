// `pnpm db:whoami [--target app|local|branch|production]`: which database a
// target is, and which version of the tables it has. Prints no secrets.
import { parseArgs } from "node:util";
import { type DatabaseState, inspectDatabase } from "./inspect";
import {
  type Target,
  TargetError,
  knownAs,
  loadLocalEnv,
  parseTargetName,
  resolveTarget,
} from "./target";

export function formatTarget(
  target: Target,
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  return [
    `Target:      ${target.name}  (from ${target.source})`,
    `Database:    ${knownAs(target, env)}`,
    `Endpoint:    ${target.endpoint}  database ${target.database}, ${target.pooled ? "pooled" : "direct"} connection`,
  ];
}

export function formatState(state: DatabaseState): string[] {
  const { applied, pending, unknown } = state.migrations;
  const total = applied.length + pending.length;
  const lines = [
    `Migrations:  ${applied.length} of ${total} applied${applied.length ? ` (last: ${applied.at(-1)})` : ""}`,
  ];
  if (pending.length) {
    lines.push(`             pending: ${pending.join(", ")}`);
  }
  if (unknown) {
    lines.push(
      `             plus ${unknown} recorded migration(s) not in this checkout (a newer branch, or an old draft)`,
    );
  }
  lines.push(
    state.batches === null
      ? "Batches:     no synthetic_batch table yet"
      : `Batches:     ${state.batches} synthetic batch(es), ${state.syntheticWorkspaces} synthetic workspace(s)`,
    `Workspaces:  ${state.workspaces} in total`,
  );
  return lines;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const { values } = parseArgs({
    options: { target: { type: "string", default: "app" } },
  });
  const target = resolveTarget(parseTargetName(values.target), process.env);
  console.log(formatTarget(target, process.env).join("\n"));
  console.log(formatState(await inspectDatabase(target.url)).join("\n"));
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    // Never echo a connection error verbatim: it can contain the URL.
    console.error(
      error instanceof TargetError
        ? error.message
        : `Could not inspect the database (${error instanceof Error ? error.name : "unknown error"}).`,
    );
    process.exitCode = 1;
  });
}
