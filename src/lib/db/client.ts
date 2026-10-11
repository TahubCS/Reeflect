import "server-only";
import { Agent } from "node:https";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import WebSocket from "ws";
import { env } from "@/lib/env";
import * as schema from "./schema";

function createPool(): Pool | NeonPool {
  if (env.DATABASE_TRANSPORT === "websocket") {
    const agent = new Agent({ keepAlive: true, proxyEnv: process.env });
    neonConfig.webSocketConstructor = class extends WebSocket {
      constructor(address: string, protocols?: string | string[]) {
        super(address, protocols, { agent });
      }
    };
  }
  const PoolConstructor =
    env.DATABASE_TRANSPORT === "websocket" ? NeonPool : Pool;
  const pool = new PoolConstructor({
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
  pool.on("error", (error: Error) => {
    console.error("database pool: idle client error", {
      message: error.message,
    });
  });
  return pool;
}

declare global {
  var reeflectPool: Pool | NeonPool | undefined;
}

// Next.js reloads modules in development; keep one pool across reloads.
const runtimePool = globalThis.reeflectPool ?? createPool();
if (process.env.NODE_ENV !== "production")
  globalThis.reeflectPool = runtimePool;

// Expose the shared pg pool methods; the drivers' full client types differ.
export const pool: {
  connect(): Promise<Pick<PoolClient, "query" | "release">>;
  end(): Promise<void>;
} = runtimePool;

export const db =
  runtimePool instanceof NeonPool
    ? drizzleNeon(runtimePool, { schema })
    : drizzle(runtimePool, { schema });
