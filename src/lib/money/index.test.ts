import { describe, expect, it } from "vitest";
import {
  ZERO,
  absolute,
  add,
  cents,
  divideFloor,
  fiveNumbers,
  formatCents,
  formatSigned,
  fraction,
  negate,
  parseBalance,
  parseDecimalString,
  parseDollars,
  parseExportAmount,
  parseReceiptTotal,
  parseStatementAmount,
  positivePart,
  quantile,
  ratio,
  subtract,
  sum,
  times,
  toDecimalString,
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

describe("parseBalance", () => {
  it.each([
    ["0", 0],
    ["0.00", 0],
    ["-0", 0],
    ["12.5", 1250],
    ["$1,204.50", 120450],
    ["-35.10", -3510],
    ["-$35.1", -3510],
    ["  250000  ", 25000000],
    ["999999999.99", 99999999999],
  ])("reads %j as %i cents", (text, expected) => {
    expect(parseBalance(text)).toBe(expected);
  });

  it.each([
    "",
    "-",
    "abc",
    "12.345",
    "12.",
    "1e3",
    "--5",
    "$-5",
    "+5",
    "1000000000",
  ])("rejects %j", (text) => {
    expect(parseBalance(text)).toBeNull();
  });
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

describe("parseStatementAmount", () => {
  it.each([
    ["$1,186.93", 118693],
    ["$2.49", 249],
    ["2.49", 249],
    ["$0.00", 0],
    ["-$2.49", -249],
    ["- $2.49", -249],
    ["($2.49)", -249],
    ["( $1,000.00 )", -100000],
    ["$2.49-", -249],
    ["2.49 CR", 249],
    ["  $12.00  ", 1200],
  ])("reads %s as %i cents", (text, expected) => {
    expect(parseStatementAmount(text)).toBe(expected);
  });

  it.each([
    "",
    "$",
    "2.4",
    "2",
    "abc",
    "$2.49.1",
    "(-$2.49)",
    "($2.49-)",
    "1.234",
  ])("rejects %j", (text) => {
    expect(parseStatementAmount(text)).toBeNull();
  });

  it("never returns negative zero", () => {
    expect(Object.is(parseStatementAmount("-$0.00"), -0)).toBe(false);
  });
});

describe("parseReceiptTotal", () => {
  it.each([
    ["23.40", 2340],
    ["$23.40", 2340],
    [" $23.40 ", 2340],
    ["0.01", 1],
    ["1,204.99", 120499],
    ["$1,204.99", 120499],
    ["1204.99", 120499],
    ["9,999.99", 999999],
    ["1,000,000.00", 100000000],
    ["1234567.00", 123456700],
  ])("reads %s as %i cents", (text, expected) => {
    expect(parseReceiptTotal(text)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "23.4",
    "23",
    "23.",
    ".40",
    "12.345",
    "0.00",
    "$0.00",
    "-5.00",
    "-$5.00",
    "(5.00)",
    "5.00-",
    "5.00 CR",
    "23,40",
    "1,20.00",
    "12,34.00",
    "1,2345.00",
    ",123.00",
    "12345678.00",
    "23.40 12.00",
    "22.00, 23.40",
    "USD 23.40",
    "23.40 USD",
    "€23.40",
    "$ 23.40",
    "$$23.40",
    "twenty",
    "23.40abc",
    "2.3e1",
    "٢٣.٤٠",
  ])("rejects %j", (text) => {
    expect(parseReceiptTotal(text)).toBeNull();
  });
});

describe("parseExportAmount", () => {
  it.each([
    ["1234", 123400],
    ["1234.5", 123450],
    ["1234.56", 123456],
    ["-12.00", -1200],
    ["0", 0],
    ["-0.00", 0],
    ["0.05", 5],
    [" 7.10 ", 710],
  ])("reads %s as %i cents", (text, value) => {
    expect(parseExportAmount(text)).toBe(value);
  });

  it.each(["", "-", "1.234", "$12.00", "1,234.00", "12.", ".50", "1e3", "--1"])(
    "rejects %j",
    (text) => {
      expect(parseExportAmount(text)).toBeNull();
    },
  );
});

describe("toDecimalString and parseDecimalString", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [-5, "-0.05"],
    [120450, "1204.50"],
    [-1234, "-12.34"],
    [100, "1.00"],
  ])("writes %i cents as %s and reads it back", (value, text) => {
    expect(toDecimalString(cents(value))).toBe(text);
    expect(parseDecimalString(text)).toBe(value);
  });

  it.each([
    "",
    "1",
    "1.5",
    "01.00",
    "-0.00",
    "$1.00",
    "1,000.00",
    " 1.00",
    "1.000",
  ])("rejects %j", (text) => {
    expect(parseDecimalString(text)).toBeNull();
  });
});

describe("quantile and fiveNumbers", () => {
  const list = (...values: number[]) => values.map(cents);

  it("reads between the two nearest amounts and rounds to the cent", () => {
    const amounts = list(400, 100, 300, 200);
    expect(quantile(amounts, 0)).toBe(100);
    expect(quantile(amounts, 1)).toBe(400);
    // Position 1.5 of 0..3: halfway between 200 and 300.
    expect(quantile(amounts, 0.5)).toBe(250);
    // Position 0.75: 100 + 0.75 × 100.
    expect(quantile(amounts, 0.25)).toBe(175);
    expect(quantile(list(0, 1), 0.5)).toBe(1);
    expect(quantile(list(-3, -2), 0.5)).toBe(-2);
  });

  it("handles one amount, none, and negative amounts", () => {
    expect(quantile(list(-500), 0.25)).toBe(-500);
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile(list(-900, 100, -100), 0.5)).toBe(-100);
  });

  it("does not reorder the caller's list", () => {
    const amounts = list(3, 1, 2);
    quantile(amounts, 0.5);
    expect(amounts).toEqual([3, 1, 2]);
  });

  it.each([-0.1, 1.1, Number.NaN])("rejects p = %s", (p) => {
    expect(() => quantile(list(1), p)).toThrow(RangeError);
  });

  it("gives the five-number summary", () => {
    expect(fiveNumbers(list(10, 20, 30, 40, 50))).toEqual({
      lowest: 10,
      lowerQuartile: 20,
      median: 30,
      upperQuartile: 40,
      highest: 50,
    });
  });
});
