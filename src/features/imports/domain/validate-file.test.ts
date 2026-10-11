import { describe, expect, it } from "vitest";
import {
  FILE_PROBLEM_TEXT,
  MAX_CSV_BYTES,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MIN_TEXT_CHARACTERS,
  checkCsvBytes,
  checkExtracted,
  checkPdfBytes,
  statementFormat,
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

describe("statementFormat", () => {
  it.each([
    [
      "PDF bytes, whatever the name",
      bytes("%PDF-1.7"),
      "export.csv",
      "",
      "pdf",
    ],
    ["a .pdf name", bytes("not really"), "Statement.PDF", "", "pdf"],
    ["a .csv name", bytes("a,b"), "transactions.CSV", "", "csv"],
    ["a CSV type", bytes("a,b"), "download", "text/csv; charset=utf-8", "csv"],
    ["anything else", bytes("a,b"), "notes.txt", "text/plain", null],
  ] as const)("reads %s", (_name, input, fileName, type, format) => {
    expect(statementFormat(input, fileName, type)).toBe(format);
  });
});

describe("checkCsvBytes", () => {
  it("decodes UTF-8 text", () => {
    expect(checkCsvBytes(bytes("Date,Café\n"))).toEqual({
      ok: true,
      text: "Date,Café\n",
    });
  });

  it.each([
    ["missing", new Uint8Array()],
    ["csv-too-large", new Uint8Array(MAX_CSV_BYTES + 1).fill(65)],
    ["not-text", bytes("%PDF-1.7")],
    ["not-text", new Uint8Array([65, 0, 66])],
    ["not-text", new Uint8Array([0xff, 0xfe, 0x41])],
  ] as const)("reports %s", (problem, input) => {
    expect(checkCsvBytes(input)).toEqual({ ok: false, problem });
  });
});
