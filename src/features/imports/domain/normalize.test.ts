import { describe, expect, it } from "vitest";
import { normalizeDescription } from "./normalize";

describe("normalizeDescription", () => {
  it.each([
    [
      "Debit Card Purchase CORNER MARKET #0042",
      "debit card purchase corner market",
    ],
    ["DAILY GRIND", "daily grind"],
    ["GAS STATION 118", "gas station"],
    ["AMAZON MKTPLACE PMTS REF: 9A8B7C", "amazon mktplace pmts"],
    ["Card xxxx1234 STREAMING SVC", "card streaming svc"],
    ["ACH PAYROLL 20260915 SAMPLE CO", "ach payroll sample co"],
    ['Zelle from "Sam"', "zelle from sam"],
    ["  Trader   Joe's  ", "trader joe's"],
    ["PAYPAL *ABC123XYZ", "paypal"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeDescription(raw)).toBe(expected);
  });
});
