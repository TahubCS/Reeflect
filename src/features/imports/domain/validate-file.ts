// ADR-044 step 1: what an uploaded statement must be before it is read.

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;
/** Fewer readable characters than this means a scan with no text layer. */
export const MIN_TEXT_CHARACTERS = 40;

export type FileProblem =
  | "missing"
  | "too-large"
  | "not-pdf"
  | "encrypted"
  | "too-many-pages"
  | "no-text"
  | "unreadable";

export const FILE_PROBLEM_TEXT: Record<FileProblem, string> = {
  missing: "Choose a PDF statement to upload.",
  "too-large":
    "That file is larger than 10 MB. Statements are usually much smaller.",
  "not-pdf":
    "That file isn't a PDF. Download the statement as a PDF and try again.",
  encrypted:
    "That PDF is password-protected. Save a copy without a password and try again.",
  "too-many-pages":
    "That PDF has more than 50 pages. Upload one statement at a time.",
  "no-text":
    "That PDF looks like a scan, so its text can't be read. Download the statement from your bank's website instead.",
  unreadable: "That PDF can't be opened. Download it again and try once more.",
};

/** Checks the bytes before any PDF library sees them. */
export function checkPdfBytes(bytes: Uint8Array): FileProblem | null {
  if (bytes.length === 0) return "missing";
  if (bytes.length > MAX_PDF_BYTES) return "too-large";
  const magic = String.fromCharCode(...bytes.subarray(0, 5));
  return magic === "%PDF-" ? null : "not-pdf";
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
