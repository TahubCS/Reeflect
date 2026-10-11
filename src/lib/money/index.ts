// All money is integer cents (USD). This is the only place money math happens.

export type Cents = number & { readonly __brand: "Cents" };

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Money must be a whole number of cents");
  }
  return value as Cents;
}

export const ZERO = cents(0);

export function add(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subtract(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function sum(amounts: readonly Cents[]): Cents {
  return amounts.reduce(add, ZERO);
}

/** The amount when it is above zero, otherwise zero. */
export function positivePart(a: Cents): Cents {
  return a > 0 ? a : ZERO;
}

export function times(a: Cents, count: number): Cents {
  return cents(a * count);
}

/** numerator/denominator of an amount, rounded to the nearest cent. */
export function fraction(
  a: Cents,
  numerator: number,
  denominator: number,
): Cents {
  return cents(Math.round((a * numerator) / denominator));
}

/** a / b as a plain number, for visual proportions only. Zero when b is zero. */
export function ratio(a: Cents, b: Cents): number {
  return b === 0 ? 0 : a / b;
}

const withCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCents(
  a: Cents,
  options: { whole?: boolean } = {},
): string {
  return (options.whole ? wholeDollars : withCents).format(a / 100);
}

export function negate(a: Cents): Cents {
  return cents(a === 0 ? 0 : -a);
}

export function absolute(a: Cents): Cents {
  return a < 0 ? negate(a) : a;
}

/** An even share of an amount, rounded down to the cent. */
export function divideFloor(a: Cents, parts: number): Cents {
  return cents(Math.floor(a / parts));
}

/**
 * Drops the cents, toward zero: $12.34 → $12.00, −$12.34 → −$12.00. Nessie
 * keeps only whole dollars on purchases, deposits, withdrawals and transfers
 * (ADR-048), so anything sent there is cut the same way first.
 */
export function truncateToDollars(a: Cents): Cents {
  return cents(Math.trunc(a / 100) * 100 || 0);
}

/** "+$12.50" or "-$12.50", for lists that mix money in and money out. */
export function formatSigned(
  a: Cents,
  options: { whole?: boolean } = {},
): string {
  return `${a < 0 ? "−" : "+"}${formatCents(absolute(a), options)}`;
}

/**
 * Reads what a person typed ("12", "12.5", "$1,204.99") as a positive amount.
 * Works on the digits directly, so no floating-point dollars are involved.
 */
export function parseDollars(text: string): Cents | null {
  const match = /^\$?(\d{1,7})(?:\.(\d{1,2}))?$/.exec(
    text.trim().replace(/,/g, ""),
  );
  if (!match) return null;
  const value =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return value > 0 ? cents(value) : null;
}

/**
 * Reads a balance someone typed ("0", "1,204.50", "-$35.10") as signed cents.
 * Unlike `parseDollars`, zero and a leading minus (an overdrawn account) are
 * allowed.
 */
export function parseBalance(text: string): Cents | null {
  const match = /^(-)?\$?(\d{1,9})(?:\.(\d{1,2}))?$/.exec(
    text.trim().replace(/,/g, ""),
  );
  if (!match) return null;
  const value = cents(
    Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0")),
  );
  return match[1] ? negate(value) : value;
}

/**
 * Reads an amount printed on a bank statement as signed cents: "$1,186.93",
 * "-$2.49", "($2.49)", "$2.49-" or "2.49 CR" (a credit, kept positive). Zero
 * is allowed. Statements always print the cents, so exactly two decimals are
 * required.
 */
export function parseStatementAmount(text: string): Cents | null {
  let rest = text.trim().replace(/,/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(rest)) {
    negative = true;
    rest = rest.slice(1, -1).trim();
  }
  if (rest.startsWith("-")) {
    if (negative) return null;
    negative = true;
    rest = rest.slice(1).trim();
  } else if (rest.endsWith("-")) {
    if (negative) return null;
    negative = true;
    rest = rest.slice(0, -1).trim();
  }
  rest = rest.replace(/\s*CR$/i, "");
  const match = /^\$?(\d{1,10})\.(\d{2})$/.exec(rest);
  if (!match) return null;
  const value = cents(Number(match[1]) * 100 + Number(match[2]));
  return negative ? negate(value) : value;
}

/**
 * Reads the total printed on a receipt ("23.40", "$1,204.99") as a positive
 * amount (F-29, ADR-067). Stricter than what a person types: receipts print
 * the cents, so exactly two decimals are required, thousands separators
 * must sit every three digits, and zero, a minus sign, brackets or "CR" are
 * refused. A string that fails here is never guessed at.
 */
export function parseReceiptTotal(text: string): Cents | null {
  const match = /^\$?(\d{1,3}(?:,\d{3}){1,2}|\d{1,7})\.(\d{2})$/.exec(
    text.trim(),
  );
  if (!match) return null;
  const value = Number(match[1]!.replace(/,/g, "")) * 100 + Number(match[2]);
  return value > 0 ? cents(value) : null;
}

/**
 * Reads an amount from a bank's CSV export as signed cents: "1234",
 * "1234.5", "1234.56", "-12.00". Exports write plain numbers and may drop
 * trailing zeros, so 0 to 2 decimals are allowed; a currency sign,
 * thousands separators or a third decimal are not.
 */
export function parseExportAmount(text: string): Cents | null {
  const match = /^(-)?(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const value = cents(Number(match[2]) * 100 + Number(fraction));
  return match[1] && value !== 0 ? negate(value) : value;
}

/**
 * An amount as a plain decimal for machine-readable files: "-12.34", "0.00",
 * "1204.50". No currency sign, no thousands separators. `parseDecimalString`
 * reads it back exactly.
 */
export function toDecimalString(a: Cents): string {
  const whole = Math.trunc(Math.abs(a) / 100);
  const part = String(Math.abs(a) % 100).padStart(2, "0");
  return `${a < 0 ? "-" : ""}${whole}.${part}`;
}

/** Reads what `toDecimalString` wrote; anything else is null. */
export function parseDecimalString(text: string): Cents | null {
  const match = /^(-)?(0|[1-9]\d{0,12})\.(\d{2})$/.exec(text);
  if (!match) return null;
  const value = cents(Number(match[2]) * 100 + Number(match[3]));
  if (match[1] && value === 0) return null;
  return match[1] ? negate(value) : value;
}

/**
 * The amount below which a share `p` (0 to 1) of the amounts fall, read
 * between the two nearest sorted amounts (the usual "linear" method) and
 * rounded to the nearest cent, halves up as in `fraction`. Zero for no
 * amounts.
 */
export function quantile(amounts: readonly Cents[], p: number): Cents {
  if (!(p >= 0 && p <= 1)) throw new RangeError("p must be from 0 to 1");
  if (amounts.length === 0) return ZERO;
  const sorted = [...amounts].sort((a, b) => a - b);
  const at = (sorted.length - 1) * p;
  const below = sorted[Math.floor(at)]!;
  const above = sorted[Math.ceil(at)]!;
  return cents(Math.round(below + (above - below) * (at - Math.floor(at))));
}

export type FiveNumbers = {
  lowest: Cents;
  lowerQuartile: Cents;
  median: Cents;
  upperQuartile: Cents;
  highest: Cents;
};

/** Lowest, 25th percentile, median, 75th percentile and highest. */
export function fiveNumbers(amounts: readonly Cents[]): FiveNumbers {
  return {
    lowest: quantile(amounts, 0),
    lowerQuartile: quantile(amounts, 0.25),
    median: quantile(amounts, 0.5),
    upperQuartile: quantile(amounts, 0.75),
    highest: quantile(amounts, 1),
  };
}
