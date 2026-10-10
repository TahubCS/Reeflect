import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "./client";

export type DatabaseHealth =
  | { readonly ok: true; readonly latencyMs: number }
  | { readonly ok: false; readonly reason: string };

type Queryable = { execute(query: SQL): PromiseLike<unknown> };

/** Runs one trivial query through the runtime pool. Never throws. */
export async function checkDatabase(
  database: Queryable = db,
): Promise<DatabaseHealth> {
  const startedAt = performance.now();
  try {
    await database.execute(sql`select 1`);
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "unknown error",
    };
  }
}
