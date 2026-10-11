// ADR-013: remove recognizable metadata, not every number in a merchant name.
const REFERENCE_CODE =
  /\b(?:ref(?:erence)?|auth(?:orization)?|confirmation|txn|transaction)\b\s*(?:(?:no\.?|number|id|code)\s*)?[#:\-]?\s*(?=[a-z0-9-]*\d)[a-z0-9-]+\b/gu;
const STORE_NUMBER =
  /\b(?:store|location|loc)\b\s*(?:(?:no\.?|number)\s*)?[#:\-]?\s*\d+\b/gu;
const TRAILING_STORE_NUMBER = /(?:^|\s+)(?:#\s*\d+\s*)+$/u;
// A store marker followed by a recognizable US city/state (and optional ZIP)
// is statement metadata. Require a merchant before it, preserving names such
// as '#1 Chinese Restaurant'. Ambiguous location text is kept.
const STORE_LOCATION =
  /\s+(?:#\s*\d+|(?:store|location|loc)\b\s*(?:(?:no\.?|number)\s*)?[#:\-]?\s*\d+)\s+(?:[\p{L}.'-]+\s+){1,4}(?:al|ak|az|ar|ca|co|ct|de|dc|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)(?:\s+\d{5}(?:-\d{4})?)?\s*$/u;
const INLINE_STORE_NUMBER = /\s+#\s*\d+\b/gu;

/** Pure normalization for merchant descriptions and rule patterns. */
export function normalizeMerchant(description: string): string {
  return description
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(REFERENCE_CODE, " ")
    .replace(STORE_LOCATION, " ")
    .replace(STORE_NUMBER, " ")
    .replace(INLINE_STORE_NUMBER, " ")
    .replace(TRAILING_STORE_NUMBER, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
