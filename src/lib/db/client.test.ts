import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => {
  const result = { rows: [{ value: 1 }], rowCount: 1, fields: [] };
  return {
    poolQuery: vi.fn().mockResolvedValue(result),
    clientQuery: vi.fn().mockResolvedValue(result),
    release: vi.fn(),
  };
});

vi.mock("pg", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pg")>();
  class TcpPool {
    query = calls.poolQuery;
    on() {
      return this;
    }
    async connect() {
      return { query: calls.clientQuery, release: calls.release };
    }
  }
  return {
    ...actual,
    Pool: TcpPool,
    default: { ...actual.default, Pool: TcpPool },
  };
});

vi.mock("@neondatabase/serverless", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@neondatabase/serverless")>();
  // Drizzle recognizes a Neon pool with instanceof, including subclasses.
  class WebSocketPool extends actual.Pool {
    query = calls.poolQuery;
    connect = vi.fn().mockResolvedValue({
      query: calls.clientQuery,
      release: calls.release,
    });
  }
  return { ...actual, Pool: WebSocketPool };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  globalThis.reeflectPool = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.reeflectPool = undefined;
});

describe.each(["tcp", "websocket"])("database transport %s", (transport) => {
  it("keeps a transaction on one client and releases it after commit", async () => {
    vi.stubEnv("DATABASE_TRANSPORT", transport);
    const { db } = await import("./client");
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
      await tx.execute(sql`select 2`);
      return "committed";
    });

    expect(result).toBe("committed");
    expect(calls.poolQuery).not.toHaveBeenCalled();
    expect(
      calls.clientQuery.mock.calls.map(([query]) => query.text.trim()),
    ).toEqual(["begin", "select 1", "select 2", "commit"]);
    expect(calls.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the client when the transaction fails", async () => {
    vi.stubEnv("DATABASE_TRANSPORT", transport);
    const { db } = await import("./client");
    const failure = new Error("abort transaction");
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(calls.poolQuery).not.toHaveBeenCalled();
    expect(
      calls.clientQuery.mock.calls.map(([query]) => query.text.trim()),
    ).toEqual(["begin", "select 1", "rollback"]);
    expect(calls.release).toHaveBeenCalledOnce();
  });
});
