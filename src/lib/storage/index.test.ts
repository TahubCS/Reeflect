import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testStore } from "../../../tests/support/storage";
import { createObjectStore, statementStore } from "./index";

// Runs against the Neon `storage-tests` branch's bucket (ADR-053); Vitest
// loads its credentials from .env.storage-tests, CI from secrets.

describe("statementStore", () => {
  const store = testStore();
  const prefix = `test/${randomUUID()}/`;

  it("puts, gets and deletes an object, keeping its text exactly", async () => {
    const body = 'posted_on,description\r\n2026-09-01,"Café, ☕"\r\n';
    await store.put(`${prefix}a.csv`, body, "text/csv; charset=utf-8");
    expect(await store.get(`${prefix}a.csv`)).toBe(body);
    await store.delete(`${prefix}a.csv`);
    expect(await store.get(`${prefix}a.csv`)).toBeNull();
  });

  it("lists and deletes everything under a prefix and nothing else", async () => {
    await store.put(`${prefix}w/1.csv`, "1", "text/csv");
    await store.put(`${prefix}w/2.csv`, "2", "text/csv");
    await store.put(`${prefix}other.csv`, "3", "text/csv");
    expect((await store.listKeys(`${prefix}w/`)).toSorted()).toEqual([
      `${prefix}w/1.csv`,
      `${prefix}w/2.csv`,
    ]);
    await store.deletePrefix(`${prefix}w/`);
    expect(await store.listKeys(`${prefix}w/`)).toEqual([]);
    expect(await store.get(`${prefix}other.csv`)).toBe("3");
    await store.deletePrefix(prefix);
    await store.deletePrefix(prefix);
  });

  it("returns the same client every time", () => {
    expect(statementStore()).toBe(store);
  });

  it("lets other errors through, such as a wrong key", async () => {
    const wrong = createObjectStore({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: "not-the-secret",
      endpoint: process.env.AWS_ENDPOINT_URL_S3!,
      region: process.env.AWS_REGION!,
      bucket: process.env.STATEMENTS_BUCKET!,
    });
    await expect(wrong.get("anything")).rejects.toThrow();
  });
});
