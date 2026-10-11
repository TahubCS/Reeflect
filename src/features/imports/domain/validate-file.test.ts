import { describe, expect, it } from "vitest";
import {
  FILE_PROBLEM_TEXT,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MIN_TEXT_CHARACTERS,
  checkExtracted,
  checkPdfBytes,
} from "./validate-file";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("checkPdfBytes", () => {
  it("accepts bytes that start with the PDF signature", () => {
    expect(checkPdfBytes(bytes("%PDF-1.7 …"))).toBeNull();
  });

  it.each([
    ["missing", new Uint8Array()],
    ["not-pdf", bytes("PK\u0003\u0004 a zip file")],
    ["not-pdf", bytes("hello %PDF-")],
    ["too-large", new Uint8Array(MAX_PDF_BYTES + 1)],
  ] as const)("reports %s", (problem, input) => {
    expect(checkPdfBytes(input)).toBe(problem);
  });
});

describe("checkExtracted", () => {
  it("accepts a statement with text within the page limit", () => {
    expect(checkExtracted(MAX_PDF_PAGES, MIN_TEXT_CHARACTERS)).toBeNull();
  });

  it("reports too many pages and scans with no text", () => {
    expect(checkExtracted(MAX_PDF_PAGES + 1, 1000)).toBe("too-many-pages");
    expect(checkExtracted(1, MIN_TEXT_CHARACTERS - 1)).toBe("no-text");
  });

  it("has a calm message for every problem", () => {
    for (const text of Object.values(FILE_PROBLEM_TEXT)) {
      expect(text).toMatch(/\.$/);
    }
  });
});
