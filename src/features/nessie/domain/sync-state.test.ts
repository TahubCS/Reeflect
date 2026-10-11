import { describe, expect, it } from "vitest";
import { describeSync, describeSyncShort, syncedAgo } from "./sync-state";

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

describe("describeSyncShort", () => {
  it("counts every kind of change together", () => {
    expect(describeSyncShort(synced)).toBe("Synced, 1 change");
    expect(
      describeSyncShort({ ...synced, added: 2, updated: 1, removed: 1 }),
    ).toBe("Synced, 4 changes");
    expect(describeSyncShort({ ...synced, added: 0 })).toBe(
      "Synced, no changes",
    );
  });

  it("names what went wrong in a few words", () => {
    expect(describeSyncShort({ status: "unreachable" })).toBe(
      "Couldn't reach Capital One",
    );
    expect(describeSyncShort({ status: "no accounts" })).toBe(
      "No Capital One accounts linked",
    );
    expect(describeSyncShort({ status: "not set up" })).toBe(
      "Capital One isn't set up here",
    );
  });
});

describe("syncedAgo", () => {
  const at = "2026-10-11T12:00:00.000Z";
  const later = (ms: number) => Date.parse(at) + ms;

  it("says when there has been no sync", () => {
    expect(syncedAgo(null, later(0))).toBe("Not synced yet");
    expect(syncedAgo("not a time", later(0))).toBe("Not synced yet");
  });

  it("rounds down to minutes, hours, then days", () => {
    expect(syncedAgo(at, later(59_000))).toBe("Synced just now");
    expect(syncedAgo(at, later(60_000))).toBe("Synced 1 min ago");
    expect(syncedAgo(at, later(59 * 60_000))).toBe("Synced 59 min ago");
    expect(syncedAgo(at, later(60 * 60_000))).toBe("Synced 1 hour ago");
    expect(syncedAgo(at, later(23 * 3_600_000))).toBe("Synced 23 hours ago");
    expect(syncedAgo(at, later(50 * 3_600_000))).toBe("Synced 2 days ago");
  });

  it("treats a clock slightly behind the server as just now", () => {
    expect(syncedAgo(at, later(-30_000))).toBe("Synced just now");
  });
});
