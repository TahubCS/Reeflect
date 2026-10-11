import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import {
  type TransactionSummary,
  balanceEffect,
  formValues,
  formatDay,
  groupByDay,
  splitPreview,
  isIsoDate,
  parseTransactionForm,
} from "./transaction-input";

const ACCOUNT = "0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const TODAY = "2026-10-10";

const valid = (overrides: Record<string, string> = {}) => ({
  accountId: ACCOUNT,
  postedOn: "2026-10-09",
  direction: "out",
  amount: "12.50",
  description: "  Lunch  ",
  ...overrides,
});

const parse = (raw: unknown, ledgerEditable = true) =>
  parseTransactionForm(raw, { today: TODAY, ledgerEditable });

describe("parseTransactionForm", () => {
  it("stores money out as negative cents, signed per ADR-008", () => {
    expect(parse(valid())).toEqual({
      ok: true,
      value: {
        description: "Lunch",
        isTransfer: false,
        ledger: {
          accountId: ACCOUNT,
          postedOn: "2026-10-09",
          amountCents: -1250,
          status: "posted",
        },
      },
    });
  });

  it("stores money in as positive cents, with commas and a dollar sign", () => {
    const parsed = parse(valid({ direction: "in", amount: "$1,204.99" }));
    expect(parsed.ok && parsed.value.ledger?.amountCents).toBe(120499);
  });

  it("reads the pending and transfer checkboxes", () => {
    const parsed = parse(valid({ pending: "on", transfer: "on" }));
    expect(parsed.ok && parsed.value).toMatchObject({
      isTransfer: true,
      ledger: { status: "pending" },
    });
  });

  it("accepts today and refuses tomorrow", () => {
    expect(parse(valid({ postedOn: TODAY })).ok).toBe(true);
    expect(parse(valid({ postedOn: "2026-10-11" }))).toEqual({
      ok: false,
      errors: { postedOn: "Enter today or an earlier date." },
    });
  });

  it.each([[""], ["10/09/2026"], ["2026-02-30"], ["2026-13-01"]])(
    "refuses the date %j",
    (postedOn) => {
      expect(parse(valid({ postedOn }))).toEqual({
        ok: false,
        errors: { postedOn: "Enter a date." },
      });
    },
  );

  it("refuses dates before 2000", () => {
    expect(parse(valid({ postedOn: "1999-12-31" }))).toEqual({
      ok: false,
      errors: { postedOn: "Enter a date in 2000 or later." },
    });
  });

  it.each([["0"], ["-5"], ["lots"], ["1.234"], [""]])(
    "refuses the amount %j",
    (amount) => {
      expect(parse(valid({ amount }))).toEqual({
        ok: false,
        errors: { amount: "Enter an amount above zero, like 12.50." },
      });
    },
  );

  it("reports every wrong field at once", () => {
    const parsed = parse({
      accountId: "nope",
      direction: "sideways",
      postedOn: "",
      amount: "",
      description: " ",
    });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && Object.keys(parsed.errors).sort()).toEqual([
      "accountId",
      "amount",
      "description",
      "direction",
      "postedOn",
    ]);
  });

  it("refuses a description over 200 characters", () => {
    expect(parse(valid({ description: "x".repeat(201) }))).toEqual({
      ok: false,
      errors: { description: "Use 200 characters or fewer." },
    });
  });

  it("refuses input that is not an object", () => {
    expect(parse(null).ok).toBe(false);
  });

  it("reads only the description and transfer mark of an imported row", () => {
    expect(
      parse({ description: "Renamed", transfer: "on", amount: "lots" }, false),
    ).toEqual({
      ok: true,
      value: { description: "Renamed", isTransfer: true, ledger: null },
    });
  });
});

describe("isIsoDate", () => {
  it("accepts real dates only", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2026-1-01")).toBe(false);
  });
});

describe("balanceEffect (ADR-050)", () => {
  const manual = { source: "manual" as const, balanceAsOf: "2026-10-05" };
  const spend = (postedOn: string) => ({
    postedOn,
    amountCents: cents(-1250),
  });

  it("counts a transaction dated on or after the balance date", () => {
    expect(balanceEffect(manual, spend("2026-10-05"))).toBe(-1250);
    expect(balanceEffect(manual, spend("2026-10-09"))).toBe(-1250);
  });

  it("leaves out one dated before it: the typed balance already holds it", () => {
    expect(balanceEffect(manual, spend("2026-10-04"))).toBe(0);
  });

  it("never moves a synced account's balance", () => {
    expect(
      balanceEffect(
        { source: "nessie", balanceAsOf: "2026-10-01" },
        spend("2026-10-09"),
      ),
    ).toBe(0);
  });

  it("does nothing when the balance has no date", () => {
    expect(
      balanceEffect(
        { source: "manual", balanceAsOf: null },
        spend("2026-10-09"),
      ),
    ).toBe(0);
  });
});

describe("formValues", () => {
  const summary: TransactionSummary = {
    id: "t",
    accountId: ACCOUNT,
    accountNickname: "Everyday",
    accountType: "checking",
    postedOn: "2026-10-09",
    amountCents: cents(-1250),
    description: "Lunch",
    status: "pending",
    isTransfer: false,
    source: "manual",
    editableInFull: true,
  };

  it("turns a stored transaction back into what the form shows", () => {
    expect(formValues(summary)).toEqual({
      accountId: ACCOUNT,
      postedOn: "2026-10-09",
      direction: "out",
      amount: "$12.50",
      description: "Lunch",
      pending: "on",
      transfer: "",
    });
  });

  it("round-trips through the parser", () => {
    const parsed = parse(formValues({ ...summary, amountCents: cents(500) }));
    expect(parsed.ok && parsed.value.ledger).toMatchObject({
      amountCents: 500,
      status: "pending",
    });
  });

  it("marks a transfer", () => {
    expect(
      formValues({ ...summary, isTransfer: true, status: "posted" }),
    ).toMatchObject({ pending: "", transfer: "on", direction: "out" });
  });
});

describe("formatDay and groupByDay", () => {
  it("names the day without shifting it by time zone", () => {
    expect(formatDay("2026-10-10")).toBe("Saturday, October 10, 2026");
  });

  it("groups consecutive rows by day, keeping their order", () => {
    const rows = [
      { id: 1, postedOn: "2026-10-10" },
      { id: 2, postedOn: "2026-10-10" },
      { id: 3, postedOn: "2026-10-08" },
    ];
    expect(groupByDay(rows)).toEqual([
      { day: "2026-10-10", transactions: [rows[0], rows[1]] },
      { day: "2026-10-08", transactions: [rows[2]] },
    ]);
    expect(groupByDay([])).toEqual([]);
  });
});

describe("splitPreview", () => {
  // Newest first, `count` rows on each day, going back a day at a time.
  const days = (...counts: number[]) =>
    counts.flatMap((count, index) =>
      Array.from({ length: count }, (_, row) => ({
        id: `${index}-${row}`,
        postedOn: `2026-10-${String(30 - index).padStart(2, "0")}`,
      })),
    );

  it("shows everything when only a few rows would be held back", () => {
    expect(splitPreview(days(10), 15).hidden).toEqual([]);
    expect(splitPreview(days(19), 15).hidden).toEqual([]);
  });

  it("holds back the rows after the preview", () => {
    const rows = days(...Array.from({ length: 50 }, () => 1));
    const { shown, hidden } = splitPreview(rows, 15);
    expect(shown).toHaveLength(15);
    expect(hidden).toHaveLength(35);
    expect([...shown, ...hidden]).toEqual(rows);
  });

  it("finishes the day the cut lands in when it ends soon after", () => {
    // 14 rows on the first days, then a day of 4 that row 15 starts.
    const rows = days(7, 7, 4, 10, 10);
    const { shown } = splitPreview(rows, 15);
    expect(shown).toHaveLength(18);
    expect(shown.at(-1)?.postedOn).not.toBe(rows[18]?.postedOn);
  });

  it("cuts inside a day that goes on too long", () => {
    const rows = days(10, 30);
    expect(splitPreview(rows, 15).shown).toHaveLength(15);
  });

  it("shows everything when finishing the day leaves only a few rows", () => {
    expect(splitPreview(days(14, 6, 3), 15).hidden).toEqual([]);
  });
});
