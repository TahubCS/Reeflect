// `pnpm batch <command>`: load, list, report, delete and promote synthetic
// batches (ADR-049, docs/SYNTHETIC.md). The database is `--target`
// (default: the batch-testing branch); every command prints which one first.
//
//   pnpm batch load <spec.json> [--seed s] [--as-of YYYY-MM-DD] [--label …] [--notes …] [--dry-run]
//   pnpm batch list
//   pnpm batch report <batchId>
//   pnpm batch delete <batchId> [--yes]
//   pnpm batch promote <batchId> --target production [--from branch] [--yes]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { GENERATOR_VERSION, expandSpec, parseSpec } from "@/features/synthetic";
import { uuidv7 } from "@/lib/db/id";
import {
  type Target,
  TargetError,
  assertWritable,
  loadLocalEnv,
  parseTargetName,
  resolveTarget,
} from "../db/target";
import { formatTarget } from "../db/whoami";
import { SpecError, prepareBatch } from "./prepare";
import { formatPersonaTable, formatWarnings, personaRows } from "./report";
import { buildRows } from "./rows";
import {
  connect,
  countBatchRows,
  deleteBatch,
  getBatch,
  insertBatch,
  listBatches,
} from "./store";

const env = process.env;
const say = (lines: string | string[]) =>
  console.log(Array.isArray(lines) ? lines.join("\n") : lines);

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function gitUserName(): string | null {
  try {
    return (
      execFileSync("git", ["config", "user.name"], {
        encoding: "utf8",
      }).trim() || null
    );
  } catch {
    return null;
  }
}

function target(name: string | undefined): Target {
  const resolved = resolveTarget(parseTargetName(name ?? "branch"), env);
  say(formatTarget(resolved, env));
  return resolved;
}

function requireId(id: string | undefined): string {
  if (!id) throw new TargetError("Give the batch id (see `pnpm batch list`).");
  return id;
}

async function load(args: string[], flags: Flags): Promise<void> {
  const file = args[0];
  if (!file)
    throw new TargetError("Give the spec file: pnpm batch load <spec.json>.");
  const seed = flags.seed ?? crypto.randomUUID().slice(0, 8);
  const prepared = prepareBatch(JSON.parse(readFileSync(file, "utf8")), {
    seed,
    today: flags["as-of"] ?? today(),
    label: flags.label,
    notes: flags.notes,
    createdBy: gitUserName(),
  });
  const { expansion } = prepared;
  const rows = expansion.people.reduce((n, p) => n + p.transactions.length, 0);
  say([
    `Spec:        ${prepared.batch.label} (${expansion.people.length} people)`,
    `Span:        ${expansion.startMonth} for ${expansion.months} month(s), up to ${expansion.asOf}`,
    `Seed:        ${seed}   generator v${GENERATOR_VERSION}   ${rows} transactions`,
    "",
    ...formatPersonaTable(personaRows(expansion)),
    "",
    ...formatWarnings(prepared.warnings),
  ]);
  if (flags["dry-run"]) {
    say("\nDry run: nothing written.");
    return;
  }

  const t = target(flags.target);
  assertWritable(t, env);
  if (t.name === "production" && !flags.yes) {
    throw new TargetError(
      "Loading into production needs --yes. Prefer `pnpm batch promote`.",
    );
  }
  const batchId = uuidv7();
  const { db, close } = connect(t.url);
  try {
    await insertBatch(
      db,
      { id: batchId, ...prepared.batch },
      buildRows(expansion, { batchId, now: new Date(), newId: uuidv7 }),
    );
    const counts = await countBatchRows(db, batchId);
    say(
      `\nLoaded batch ${batchId}: ${counts.workspaces} workspaces, ${counts.accounts} accounts, ${counts.transactions} transactions.`,
    );
  } finally {
    await close();
  }
}

async function list(flags: Flags): Promise<void> {
  const t = target(flags.target);
  const { db, close } = connect(t.url);
  try {
    const batches = await listBatches(db);
    if (batches.length === 0) return say("\nNo synthetic batches.");
    say("");
    for (const b of batches) {
      say([
        `${b.id}  ${b.label}`,
        `    ${b.workspaces} people, ${b.startMonth} × ${b.months} month(s) to ${b.asOf}, seed ${b.seed}, generator v${b.generatorVersion}`,
        `    loaded ${b.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC${b.createdBy ? ` by ${b.createdBy}` : ""}${b.promotedFrom ? `, promoted from ${b.promotedFrom}` : ""}`,
      ]);
    }
  } finally {
    await close();
  }
}

async function report(args: string[], flags: Flags): Promise<void> {
  const id = requireId(args[0]);
  const t = target(flags.target);
  const { db, close } = connect(t.url);
  try {
    const batch = await getBatch(db, id);
    if (!batch) throw new TargetError(`No batch ${id} in this database.`);
    const counts = await countBatchRows(db, id);
    const parsed = parseSpec(batch.spec);
    if (!parsed.ok) throw new SpecError(parsed.problems);
    say([
      `\n${batch.label}  (seed ${batch.seed}, generator v${batch.generatorVersion})`,
      "",
    ]);
    if (batch.generatorVersion !== GENERATOR_VERSION) {
      say(
        `Generator is now v${GENERATOR_VERSION}; figures below are from the stored rows' recipe and may differ.`,
      );
    }
    const expansion = expandSpec(parsed.spec, { seed: batch.seed });
    const expected = expansion.people.reduce(
      (n, p) => n + p.transactions.length,
      0,
    );
    say([
      ...formatPersonaTable(personaRows(expansion)),
      "",
      `Rows in database: ${counts.workspaces} workspaces, ${counts.accounts} accounts, ${counts.transactions} transactions` +
        (counts.transactions === expected
          ? " (matches the recipe)"
          : ` (recipe gives ${expected}: check this batch)`),
    ]);
  } finally {
    await close();
  }
}

async function remove(args: string[], flags: Flags): Promise<void> {
  const id = requireId(args[0]);
  const t = target(flags.target);
  assertWritable(t, env);
  const { db, close } = connect(t.url);
  try {
    const batch = await getBatch(db, id);
    if (!batch) throw new TargetError(`No batch ${id} in this database.`);
    const counts = await countBatchRows(db, id);
    say(
      `\nBatch "${batch.label}": ${counts.workspaces} workspaces, ${counts.accounts} accounts, ${counts.transactions} transactions.`,
    );
    if (!flags.yes) return say("Run again with --yes to delete it.");
    const removed = await deleteBatch(db, id);
    say(`Deleted ${removed} workspaces and the batch.`);
  } finally {
    await close();
  }
}

async function promote(args: string[], flags: Flags): Promise<void> {
  const id = requireId(args[0]);
  say("From:");
  const source = target(flags.from ?? "branch");
  say("To:");
  const destination = target(flags.target ?? "production");
  assertWritable(destination, env);
  if (source.endpoint === destination.endpoint) {
    throw new TargetError("--from and --target are the same database.");
  }

  const from = connect(source.url);
  let recipe;
  try {
    recipe = await getBatch(from.db, id);
    if (!recipe) throw new TargetError(`No batch ${id} on ${source.name}.`);
  } finally {
    await from.close();
  }
  if (recipe.generatorVersion !== GENERATOR_VERSION) {
    throw new TargetError(
      `Batch was made by generator v${recipe.generatorVersion}; this checkout is v${GENERATOR_VERSION}, so a replay would differ. Use the matching checkout.`,
    );
  }
  const prepared = prepareBatch(recipe.spec, {
    seed: recipe.seed,
    today: recipe.asOf,
    label: recipe.label,
    notes: recipe.notes ?? undefined,
    createdBy: gitUserName(),
    promotedFrom: `${source.name} ${source.endpoint} batch ${recipe.id}`,
  });
  const rows = prepared.expansion.people.reduce(
    (n, p) => n + p.transactions.length,
    0,
  );
  say(
    `\nReplay "${recipe.label}": ${prepared.expansion.people.length} people, ${rows} transactions.`,
  );
  if (!flags.yes) return say("Run again with --yes to write it.");

  const batchId = uuidv7();
  const to = connect(destination.url);
  try {
    await insertBatch(
      to.db,
      { id: batchId, ...prepared.batch },
      buildRows(prepared.expansion, {
        batchId,
        now: new Date(),
        newId: uuidv7,
      }),
    );
    const counts = await countBatchRows(to.db, batchId);
    say(
      `Promoted as batch ${batchId}: ${counts.workspaces} workspaces, ${counts.accounts} accounts, ${counts.transactions} transactions.`,
    );
  } finally {
    await to.close();
  }
}

type Flags = {
  target?: string;
  from?: string;
  seed?: string;
  "as-of"?: string;
  label?: string;
  notes?: string;
  "dry-run"?: boolean;
  yes?: boolean;
};

async function main(): Promise<void> {
  loadLocalEnv();
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: "string" },
      from: { type: "string" },
      seed: { type: "string" },
      "as-of": { type: "string" },
      label: { type: "string" },
      notes: { type: "string" },
      "dry-run": { type: "boolean" },
      yes: { type: "boolean" },
    },
  });
  const [command, ...args] = positionals;
  switch (command) {
    case "load":
      return load(args, values);
    case "list":
      return list(values);
    case "report":
      return report(args, values);
    case "delete":
      return remove(args, values);
    case "promote":
      return promote(args, values);
    default:
      say(
        "Usage: pnpm batch <load|list|report|delete|promote> … (see scripts/batch/cli.ts)",
      );
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (error instanceof TargetError || error instanceof SpecError) {
    console.error(error.message);
  } else if (error instanceof SyntaxError) {
    console.error(`The spec file is not valid JSON (${error.message}).`);
  } else {
    // A database error can quote the connection string: print its kind only.
    const code = (error as { code?: unknown })?.code;
    console.error(
      `Failed (${error instanceof Error ? error.name : "unknown error"}${typeof code === "string" ? `, ${code}` : ""}).`,
    );
  }
  process.exitCode = 1;
});
