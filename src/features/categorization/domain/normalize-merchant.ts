// ADR-013: remove recognizable metadata, not every number in a merchant name.
const REFERENCE_CODE =
  /\b(?:ref(?:erence)?|auth(?:orization)?|confirmation|txn|transaction)\b\s*(?:(?:no\.?|number|id|code)\s*)?[#:\-]?\s*(?=[a-z0-9-]*\d)[a-z0-9-]+\b/gu;
const STORE_NUMBER =
  /\b(?:store|location|loc)\b\s*(?:(?:no\.?|number)\s*)?[#:\-]?\s*\d+\b/gu;
const TRAILING_STORE_NUMBER = /(?:^|\s+)(?:#\s*\d+\s*)+$/u;

/** Pure normalization for merchant descriptions and rule patterns. */
export function normalizeMerchant(description: string): string {
  return description
    .normalize("NFKC")
    .toLowerCase()
    .replace(REFERENCE_CODE, " ")
    .replace(STORE_NUMBER, " ")
    .replace(TRAILING_STORE_NUMBER, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
