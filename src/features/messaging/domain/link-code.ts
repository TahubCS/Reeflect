// The one-time code a user texts to link their phone (ADR-034, ADR-050).

export const LINK_CODE_LENGTH = 6;
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

const CODE_SPACE = 10 ** LINK_CODE_LENGTH;
const UINT32_RANGE = 2 ** 32;
// Values at or above this would make low codes slightly more likely.
const UNBIASED_LIMIT = UINT32_RANGE - (UINT32_RANGE % CODE_SPACE);

function cryptoUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

/** A uniformly random code of `LINK_CODE_LENGTH` digits, zero-padded. */
export function generateLinkCode(
  randomUint32: () => number = cryptoUint32,
): string {
  let value = randomUint32();
  while (value >= UNBIASED_LIMIT) value = randomUint32();
  return String(value % CODE_SPACE).padStart(LINK_CODE_LENGTH, "0");
}

/** "482193" becomes "482 193", which is easier to read and to type. */
export function formatLinkCode(code: string): string {
  const half = LINK_CODE_LENGTH / 2;
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

/**
 * The digits of a code as someone typed it ("482 193", "482-193"), or null
 * when it is not exactly `LINK_CODE_LENGTH` digits.
 */
export function normalizeLinkCode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${LINK_CODE_LENGTH}}$`).test(digits) ? digits : null;
}
