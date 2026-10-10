import { describe, expect, it } from "vitest";
import {
  ZERO,
  absolute,
  add,
  cents,
  divideFloor,
  formatCents,
  formatSigned,
  fraction,
  negate,
  parseDollars,
  positivePart,
  ratio,
  subtract,
  sum,
  times,
  truncateToDollars,
} from "./index";

describe("cents", () => {
  it("accepts whole numbers of cents, including negatives", () => {
    expect(cents(1250)).toBe(1250);
    expect(cents(-1)).toBe(-1);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "rejects %s",
    (value) => {
      expect(() => cents(value)).toThrow(RangeError);
    },
  );
});

describe("arithmetic", () => {
  it("adds and subtracts as inverses", () => {
    const start = cents(1999);
    const change = cents(501);

    expect(add(start, change)).toBe(2500);
    expect(subtract(add(start, change), change)).toBe(start);
  });

  it("sums a list, and an empty list is zero", () => {
    expect(sum([cents(100), cents(-30), cents(5)])).toBe(75);
    expect(sum([])).toBe(ZERO);
  });

  it("multiplies by a count", () => {
    expect(times(cents(1549), 12)).toBe(18588);
  });

  it("keeps the positive part and floors negatives at zero", () => {
    expect(positivePart(cents(1))).toBe(1);
    expect(positivePart(ZERO)).toBe(ZERO);
    expect(positivePart(cents(-500))).toBe(ZERO);
  });

  it("negates without producing negative zero", () => {
    expect(negate(cents(250))).toBe(-250);
    expect(negate(cents(-250))).toBe(250);
    expect(Object.is(negate(ZERO), 0)).toBe(true);
  });

  it("takes the absolute value", () => {
    expect(absolute(cents(-250))).toBe(250);
    expect(absolute(cents(250))).toBe(250);
  });

  it("rounds a fraction to the nearest cent", () => {
    expect(fraction(cents(1000), 1, 3)).toBe(333);
    expect(fraction(cents(1000), 2, 3)).toBe(667);
  });

  it("rounds an even share down, so shares never exceed the total", () => {
    expect(divideFloor(cents(1000), 3)).toBe(333);
    expect(divideFloor(cents(29554), 8)).toBe(3694);
  });

  it("gives a ratio for proportions, and zero when dividing by zero", () => {
    expect(ratio(cents(50), cents(200))).toBe(0.25);
    expect(ratio(cents(50), ZERO)).toBe(0);
  });
});

describe("formatting", () => {
  it("formats cents as US dollars", () => {
    expect(formatCents(cents(123456))).toBe("$1,234.56");
    expect(formatCents(ZERO)).toBe("$0.00");
    expect(formatCents(cents(-1250))).toBe("-$12.50");
  });

  it("formats whole dollars when asked", () => {
    expect(formatCents(cents(123456), { whole: true })).toBe("$1,235");
  });

  it("marks money in with a plus and money out with a minus sign", () => {
    expect(formatSigned(cents(1250))).toBe("+$12.50");
    expect(formatSigned(cents(-1250))).toBe("−$12.50");
    expect(formatSigned(ZERO)).toBe("+$0.00");
    expect(formatSigned(cents(-1250), { whole: true })).toBe("−$13");
  });
});

describe("parseDollars", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["$1,204.99", 120499],
    ["  7  ", 700],
    ["0.01", 1],
  ])("reads %j as %i cents", (text, expected) => {
    expect(parseDollars(text)).toBe(expected);
  });

  it.each(["", "abc", "0", "0.00", "-12", "12.345", "12.", "1e3", "12 lunch"])(
    "rejects %j",
    (text) => {
      expect(parseDollars(text)).toBeNull();
    },
  );
});

describe("truncateToDollars", () => {
  it.each([
    [1234, 1200],
    [1299, 1200],
    [-1234, -1200],
    [-99, 0],
    [99, 0],
    [0, 0],
    [500, 500],
  ])("cuts %i cents to %i", (value, expected) => {
    expect(truncateToDollars(cents(value))).toBe(expected);
  });

  it("never returns negative zero", () => {
    expect(Object.is(truncateToDollars(cents(-99)), -0)).toBe(false);
  });
});
