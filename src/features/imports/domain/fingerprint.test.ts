import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import { fingerprints } from "./fingerprint";

const coffee = {
  postedOn: "2026-09-02",
  description: "DAILY GRIND #12",
  amountCents: cents(-575),
  runningBalanceCents: null,
};

describe("fingerprints", () => {
  it("numbers identical rows so two coffees stay two transactions", () => {
    const [first, second, other] = fingerprints("acct", [
      coffee,
      { ...coffee, description: "Daily Grind #13" },
      { ...coffee, amountCents: cents(-600) },
    ]);
    expect(first).toBe("stmt:acct|2026-09-02|-575|daily grind|0");
    expect(second).toBe("stmt:acct|2026-09-02|-575|daily grind|1");
    expect(other).toBe("stmt:acct|2026-09-02|-600|daily grind|0");
  });

  it("gives the same keys when an overlapping statement is read again", () => {
    expect(fingerprints("acct", [coffee, coffee])).toEqual(
      fingerprints("acct", [coffee, coffee]),
    );
  });

  it("includes the account", () => {
    expect(fingerprints("a", [coffee])).not.toEqual(
      fingerprints("b", [coffee]),
    );
  });
});
