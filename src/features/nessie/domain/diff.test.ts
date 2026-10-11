import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import { type StoredRow, planSync } from "./diff";
import type { SyncedRow } from "./map";

function synced(id: string, amount = -900): SyncedRow {
  return {
    externalId: `purchase:${id}`,
    fingerprint: `nessie:purchase:${id}`,
    postedOn: "2026-10-01",
    amountCents: cents(amount),
    descriptionRaw: "Dinner",
    status: "posted",
    isTransfer: false,
    categoryKey: null,
    transferPairId: null,
  };
}

function stored(id: string, amount = -900): StoredRow {
  const row: Partial<SyncedRow> = { ...synced(id, amount) };
  delete row.fingerprint;
  return { ...(row as Omit<SyncedRow, "fingerprint">), id: `row-${id}` };
}

describe("planSync", () => {
  it("adds new records, updates changed ones and removes missing ones", () => {
    const plan = planSync(
      [stored("a"), stored("b"), stored("c")],
      [synced("a"), synced("b", -1200), synced("d")],
    );
    expect(plan.add.map((r) => r.externalId)).toEqual(["purchase:d"]);
    expect(plan.update.map((u) => [u.id, u.row.amountCents])).toEqual([
      ["row-b", -1200],
    ]);
    expect(plan.remove).toEqual(["row-c"]);
  });

  it("changes nothing when both sides match", () => {
    expect(planSync([stored("a")], [synced("a")])).toEqual({
      add: [],
      update: [],
      remove: [],
    });
  });

  it("removes everything when Nessie returns nothing", () => {
    expect(planSync([stored("a")], []).remove).toEqual(["row-a"]);
  });
});
