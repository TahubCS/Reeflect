import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // Neon's pooler does the real pooling; each server instance stays small.
    max: 5,
    // Neon suspends an idle database; the first query after that waits for
    // it to wake, so allow longer than a normal connect.
    connectionTimeoutMillis: 10_000,
    // Drop idle clients before Neon closes them from its side.
    idleTimeoutMillis: 20_000,
  });
  // An idle client can fail when Neon suspends. Without a listener that
  // error would crash the process; the pool already discards the client.
  pool.on("error", (error) => {
    console.error("database pool: idle client error", {
      message: error.message,
    });
  });
  return pool;
}

declare global {
  var reeflectPool: Pool | undefined;
}

// Next.js reloads modules in development; keep one pool across reloads.
export const pool: Pool = globalThis.reeflectPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.reeflectPool = pool;

export const db = drizzle(pool, { schema });
