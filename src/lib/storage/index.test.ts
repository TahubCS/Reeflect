import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createObjectStore, statementStore } from "./index";

// Runs against S3Mock from docker-compose.yml (or the CI service), never
// against Neon: Vitest sets the AWS_* variables in vitest.config.ts.

describe("statementStore", () => {
  const store = statementStore()!;
  const prefix = `test/${randomUUID()}/`;

  it("is configured in tests", () => {
    expect(store).not.toBeNull();
  });

  it("puts, gets and deletes an object, keeping its text exactly", async () => {
    const body = 'posted_on,description\r\n2026-09-01,"Café, ☕"\r\n';
    await store.put(`${prefix}a.csv`, body, "text/csv; charset=utf-8");
    expect(await store.get(`${prefix}a.csv`)).toBe(body);
    await store.delete(`${prefix}a.csv`);
    expect(await store.get(`${prefix}a.csv`)).toBeNull();
  });

  it("deletes everything under a prefix and nothing else", async () => {
    await store.put(`${prefix}w/1.csv`, "1", "text/csv");
    await store.put(`${prefix}w/2.csv`, "2", "text/csv");
    await store.put(`${prefix}other.csv`, "3", "text/csv");
    await store.deletePrefix(`${prefix}w/`);
    expect(await store.get(`${prefix}w/1.csv`)).toBeNull();
    expect(await store.get(`${prefix}w/2.csv`)).toBeNull();
    expect(await store.get(`${prefix}other.csv`)).toBe("3");
    await store.deletePrefix(prefix);
  });

  it("returns the same client every time", () => {
    expect(statementStore()).toBe(store);
  });

  it("lets other errors through", async () => {
    const wrong = createObjectStore({
      accessKeyId: "x",
      secretAccessKey: "x",
      endpoint: process.env.AWS_ENDPOINT_URL_S3!,
      region: "us-east-1",
      bucket: "no-such-bucket",
    });
    await expect(wrong.get("anything")).rejects.toThrow();
  });
});
