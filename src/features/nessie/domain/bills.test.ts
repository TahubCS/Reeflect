import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "@/features/categorization/client";
import { mapBills, nextDueOn } from "./bills";
import type { NessieBill } from "./records";

const bill = (over: Partial<NessieBill> = {}): NessieBill => ({
  _id: "b1",
  status: "recurring",
  payee: "Netflix",
  nickname: "Netflix [cat:subscriptions]",
  payment_date: "2026-10-11",
  recurring_date: 11,
  payment_amount: 15.49,
  ...over,
});

describe("nextDueOn", () => {
  it("waits for a start date in the future", () => {
    expect(nextDueOn("2026-11-03", 3, "2026-10-11")).toBe("2026-11-03");
    expect(nextDueOn("2026-11-03", 1, "2026-10-11")).toBe("2026-12-01");
  });

  it("counts today and rolls a past start forward", () => {
    expect(nextDueOn("2026-10-11", 11, "2026-10-11")).toBe("2026-10-11");
    expect(nextDueOn("2026-01-20", 20, "2026-10-11")).toBe("2026-10-20");
    expect(nextDueOn("2026-01-05", 5, "2026-10-11")).toBe("2026-11-05");
  });

  it("keeps the day on short months", () => {
    expect(nextDueOn("2026-01-31", 31, "2027-02-10")).toBe("2027-02-28");
  });
});

describe("mapBills", () => {
  it("turns a recurring bill into a series, keeping cents and the category kind", () => {
    expect(mapBills([bill()], "2026-10-11")).toEqual([
      {
        merchant: normalizeMerchant("Netflix"),
        name: "Netflix",
        kind: "subscription",
        amountCents: 1549,
        nextOn: "2026-10-11",
      },
    ]);
  });

  it("skips cancelled, one-off and zero bills, and calls the rest bills", () => {
    const rows = mapBills(
      [
        bill({ _id: "c", status: "cancelled" }),
        bill({ _id: "o", payee: "Once", recurring_date: undefined }),
        bill({ _id: "z", payee: "Zero", payment_amount: 0 }),
        bill({
          _id: "r",
          payee: "Rent",
          nickname: undefined,
          payment_amount: 1200,
        }),
      ],
      "2026-10-11",
    );
    expect(rows.map((r) => [r.name, r.kind, r.amountCents])).toEqual([
      ["Rent", "bill", 120000],
    ]);
  });
});
