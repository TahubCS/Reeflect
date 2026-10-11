import { describe, expect, it } from "vitest";
import { readRecords } from "./csv-records";

describe("readRecords for uploads", () => {
  const read = (text: string) => readRecords(text, "upload");

  it("reads CRLF and LF line ends alike", () => {
    expect(read("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(read("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops a UTF-8 byte order mark", () => {
    expect(read("﻿a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("skips blank lines, including trailing ones", () => {
    expect(read("a,b\n\n1,2\n\n\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reads a last line with no line end", () => {
    expect(read("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps quoted commas, quotes and line breaks inside a field", () => {
    expect(read('"Coffee, tea","Joe\'s ""Best""","two\nlines"\n')).toEqual([
      ["Coffee, tea", 'Joe\'s "Best"', "two\nlines"],
    ]);
  });

  it("keeps empty fields", () => {
    expect(read("a,,c\n,,\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("refuses a quote that never closes", () => {
    expect(read('a,"b\n1,2\n')).toBeNull();
  });
});

describe("readRecords for the canonical CSV", () => {
  const read = (text: string) => readRecords(text, "canonical");

  it("reads CRLF records ending in CRLF", () => {
    expect(read("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not end a record at a bare LF", () => {
    expect(read("a,b\n1,2\r\n")).toEqual([["a", "b\n1", "2"]]);
  });

  it.each([
    ["no final line end", "a,b\r\n1,2"],
    ["an open quote", 'a,"b\r\n'],
  ])("refuses %s", (_name, text) => {
    expect(read(text)).toBeNull();
  });
});
