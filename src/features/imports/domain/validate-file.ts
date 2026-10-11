// ADR-044 step 1: what an uploaded statement must be before it is read.
// A statement is a PDF, or a CSV export of the account's transactions.

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Well under Vercel's 4.5 MB request cap; a year of rows is far smaller. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
/** Data rows, not counting the header. */
export const MAX_CSV_ROWS = 10_000;
export const MAX_PDF_PAGES = 50;
/** Fewer readable characters than this means a scan with no text layer. */
export const MIN_TEXT_CHARACTERS = 40;

export type FileProblem =
  | "missing"
  | "too-large"
  | "not-pdf"
  | "unknown-type"
  | "csv-too-large"
  | "not-text"
  | "csv-unreadable"
  | "too-many-rows"
  | "encrypted"
  | "too-many-pages"
  | "no-text"
  | "unreadable";

export const FILE_PROBLEM_TEXT: Record<FileProblem, string> = {
  missing: "Choose a statement to upload: a PDF, or a CSV export.",
  "too-large":
    "That file is larger than 10 MB. Statements are usually much smaller.",
  "not-pdf":
    "That file isn't a PDF. Download the statement as a PDF and try again.",
  "unknown-type":
    "That file isn't a PDF or a CSV file. Download the statement as a PDF, or the transactions as a CSV, and try again.",
  "csv-too-large":
    "That CSV is larger than 2 MB. Download a shorter date range and try again.",
  "not-text":
    "That CSV can't be read as text. Download it again from your bank and try once more.",
  "csv-unreadable":
    "That CSV can't be read: a quoted value never ends. Download it again from your bank and try once more.",
  "too-many-rows":
    "That CSV has more than 10,000 rows. Download a shorter date range and try again.",
  encrypted:
    "That PDF is password-protected. Save a copy without a password and try again.",
  "too-many-pages":
    "That PDF has more than 50 pages. Upload one statement at a time.",
  "no-text":
    "That PDF looks like a scan, so its text can't be read. Download the statement from your bank's website instead.",
  unreadable: "That PDF can't be opened. Download it again and try once more.",
};

const startsWithPdfMagic = (bytes: Uint8Array) =>
  String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";

/** Checks the bytes before any PDF library sees them. */
export function checkPdfBytes(bytes: Uint8Array): FileProblem | null {
  if (bytes.length === 0) return "missing";
  if (bytes.length > MAX_PDF_BYTES) return "too-large";
  return startsWithPdfMagic(bytes) ? null : "not-pdf";
}

/** Checks what was extracted: page count and whether there was any text. */
export function checkExtracted(
  pages: number,
  textCharacters: number,
): FileProblem | null {
  if (pages > MAX_PDF_PAGES) return "too-many-pages";
  if (textCharacters < MIN_TEXT_CHARACTERS) return "no-text";
  return null;
}

export type StatementFormat = "pdf" | "csv";

/**
 * Which reader an upload goes to: the PDF signature wins, then the file's
 * name or type. Anything else is neither.
 */
export function statementFormat(
  bytes: Uint8Array,
  fileName: string,
  contentType: string,
): StatementFormat | null {
  if (startsWithPdfMagic(bytes) || /\.pdf$/i.test(fileName)) return "pdf";
  if (/\.csv$/i.test(fileName) || /^text\/csv\b/i.test(contentType)) {
    return "csv";
  }
  return null;
}

export type CsvBytes =
  { ok: true; text: string } | { ok: false; problem: FileProblem };

/** Checks a CSV upload's bytes and decodes them as UTF-8 text. */
export function checkCsvBytes(bytes: Uint8Array): CsvBytes {
  if (bytes.length === 0) return { ok: false, problem: "missing" };
  if (bytes.length > MAX_CSV_BYTES)
    return { ok: false, problem: "csv-too-large" };
  if (startsWithPdfMagic(bytes) || bytes.includes(0)) {
    return { ok: false, problem: "not-text" };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text };
  } catch {
    return { ok: false, problem: "not-text" };
  }
}
