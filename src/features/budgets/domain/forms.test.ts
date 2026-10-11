import { describe, expect, it } from "vitest";
import {
  amountSchema,
  isSpendingCategory,
  parseBudgetAmount,
  targetSchema,
} from "./forms";
function form(value?: string | Blob) {
  const f = new FormData();
  if (value !== undefined) f.set("amount", value);
  return f;
}
describe("budget input", () => {
  it.each([
    ["0", 0],
    ["0.00", 0],
    ["  $1,234.50 ", 123450],
    ["12.5", 1250],
    ["100000000", 10000000000],
  ])("reads %s as %s cents", (input, expected) =>
    expect(parseBudgetAmount(form(String(input)))).toEqual({
      ok: true,
      amountCents: expected,
    }),
  );
  it.each([
    "",
    "-1",
    "12.345",
    "EUR 12",
    "1e5",
    "NaN",
    "100000000.01",
    "Infinity",
  ])("rejects %s while retaining input", (input) =>
    expect(parseBudgetAmount(form(input))).toMatchObject({
      ok: false,
      state: { errors: { amount: expect.any(String) }, amount: input },
    }),
  );
  it("rejects missing/file inputs and bounds returned text", () => {
    expect(parseBudgetAmount(form()).ok).toBe(false);
    expect(parseBudgetAmount(form(new Blob(["12"])))).toMatchObject({
      ok: false,
      state: { amount: "" },
    });
    const result = parseBudgetAmount(form("x".repeat(500)));
    if (!result.ok) expect(result.state.amount).toHaveLength(100);
  });
  it("validates numeric bounds, month and category IDs", () => {
    for (const value of [-1, 0.1, Infinity, Number.MAX_SAFE_INTEGER])
      expect(amountSchema.safeParse(value).success).toBe(false);
    expect(
      targetSchema.safeParse({ categoryId: "other", month: "2026-10" }).success,
    ).toBe(false);
    expect(
      targetSchema.parse({ categoryId: crypto.randomUUID(), month: "2026-10" })
        .month,
    ).toBe("2026-10");
  });
  it("uses preset keys, preserving renamed and additional spending categories", () => {
    for (const key of ["income", "retirement", "investing"])
      expect(isSpendingCategory(key)).toBe(false);
    for (const key of ["groceries", "loans", "subscriptions", "custom"])
      expect(isSpendingCategory(key)).toBe(true);
  });
});
