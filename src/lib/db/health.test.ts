import { afterAll, describe, expect, it } from "vitest";
import { pool } from "./client";
import { checkDatabase } from "./health";

// Integration tests: they need the PostgreSQL from `docker compose up -d`
// (or the CI service). See TEST-05.
describe("checkDatabase", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("reports ok with a latency when the database answers", async () => {
    const health = await checkDatabase();

    expect(health.ok).toBe(true);
    expect(health).toHaveProperty("latencyMs");
  });

  it("reports the reason instead of throwing when the query fails", async () => {
    const failing = {
      execute: () => Promise.reject(new Error("connection terminated")),
    };

    expect(await checkDatabase(failing)).toEqual({
      ok: false,
      reason: "connection terminated",
    });
  });

  it("reports an unknown error when something other than an Error is thrown", async () => {
    const failing = { execute: () => Promise.reject("boom") };

    expect(await checkDatabase(failing)).toEqual({
      ok: false,
      reason: "unknown error",
    });
  });
});
