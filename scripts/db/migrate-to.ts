// `pnpm db:migrate:to <local|branch|production>`: apply the repo's
// migrations to a named database, printing which one before and after.
// `pnpm db:migrate` still migrates whatever .env.local points at.
import { spawnSync } from "node:child_process";
import { inspectDatabase } from "./inspect";
import {
  TargetError,
  assertWritable,
  loadLocalEnv,
  parseTargetName,
  resolveTarget,
} from "./target";
import { formatState, formatTarget } from "./whoami";

async function main(): Promise<void> {
  loadLocalEnv();
  const target = resolveTarget(parseTargetName(process.argv[2]), process.env);
  console.log(formatTarget(target, process.env).join("\n"));
  assertWritable(target, process.env);
  console.log(formatState(await inspectDatabase(target.url)).join("\n"));
  console.log("\nMigrating…");

  // drizzle.config.ts reads .env.local only when DATABASE_URL is unset, so
  // setting both here pins drizzle-kit to this target.
  // One fixed command string: the shell is only there to find pnpm on Windows.
  const result = spawnSync("pnpm exec drizzle-kit migrate", {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: target.url,
      DATABASE_URL_UNPOOLED: target.url,
    },
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }
  console.log(formatState(await inspectDatabase(target.url)).join("\n"));
}

main().catch((error: unknown) => {
  console.error(
    error instanceof TargetError
      ? error.message
      : `Migration failed (${error instanceof Error ? error.name : "unknown error"}).`,
  );
  process.exitCode = 1;
});
