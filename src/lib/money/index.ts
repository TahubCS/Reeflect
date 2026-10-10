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
