import { describe, expect, it } from "vitest";
import { describeSync } from "./sync-state";

const synced = {
  status: "synced" as const,
  accounts: 3,
  added: 1,
  updated: 0,
  removed: 0,
  nessieRecords: 413,
  reeflectRows: 413,
  bills: 0,
  ms: 900,
};

describe("describeSync", () => {
  it("shows both counts so Nessie and Reeflect can be compared", () => {
    expect(describeSync(synced)).toBe(
      "1 new from Capital One (3 accounts, 0.9 s). Nessie: 413 records · Reeflect: 413 rows.",
    );
  });

  it("adds recurring bills only when there are some", () => {
    expect(describeSync({ ...synced, added: 0, bills: 1 })).toBe(
      "No changes from Capital One (3 accounts, 0.9 s). Nessie: 413 records · Reeflect: 413 rows · 1 recurring bill.",
    );
  });
});
