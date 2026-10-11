// The normalized merchant name (ADR-013): lowercase, with store numbers,
// reference codes and card suffixes stripped. Fingerprints use it (ADR-010)
// and categorization will (F-08).

export function normalizeDescription(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/#\s*\d+/g, " ")
    .replace(/\b(?:ref|conf|auth|trace|id)[:.#]?\s*[a-z0-9-]+/g, " ")
    .replace(/\b(?:x+|\*+)\d{2,}\b/g, " ")
    .replace(/\b[a-z]*\d[a-z\d]{3,}\b/g, " ")
    .replace(/\d{3,}/g, " ")
    .replace(/[^a-z0-9&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
