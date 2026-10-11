import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "./client";
import { uuidv7 } from "./id";

// Integration test (TEST-05): runs the migration's SQL inside a transaction
// that is always rolled back, so other tests see no change.
const sql = readFileSync(
  new URL("./migrations/0004_verify_existing_users.sql", import.meta.url),
  "utf8",
);

describe("0004_verify_existing_users (ADR-052)", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("marks every existing user as verified", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ids = [uuidv7(), uuidv7()];
      for (const [index, id] of ids.entries()) {
        await client.query(
          `INSERT INTO "user" (id, name, email, email_verified)
           VALUES ($1, 'Test user', $2, $3)`,
          [id, `migration-0003-${id}@example.test`, index === 0],
        );
      }

      await client.query(sql);

      const { rows } = await client.query<{ email_verified: boolean }>(
        `SELECT email_verified FROM "user" WHERE id = ANY($1)`,
        [ids],
      );
      expect(rows).toEqual([
        { email_verified: true },
        { email_verified: true },
      ]);
      const unverified = await client.query(
        `SELECT 1 FROM "user" WHERE email_verified = false`,
      );
      expect(unverified.rowCount).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
