// RFC 4180 records, read two ways. `canonical` reads only what `toCsv`
// writes: CRLF line ends and a final CRLF, nothing else. `upload` reads a
// bank's export as people download it: an optional UTF-8 byte order mark,
// LF or CRLF line ends, blank lines and no final line end.

export type RecordsMode = "canonical" | "upload";

/** Splits text into records of fields. Null on unbalanced quotes. */
export function readRecords(
  input: string,
  mode: RecordsMode,
): string[][] | null {
  const upload = mode === "upload";
  const text = upload && input.startsWith("﻿") ? input.slice(1) : input;
  const out: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const endRecord = () => {
    record.push(field);
    // A blank line in an export is one empty field; it is not a record.
    if (!(upload && record.length === 1 && record[0] === "")) out.push(record);
    record = [];
    field = "";
  };
  while (i < text.length) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (char === '"') quoted = false;
      else field += char;
      i += 1;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\r" && text[i + 1] === "\n") {
      endRecord();
      i += 1;
    } else if (upload && char === "\n") endRecord();
    else field += char;
    i += 1;
  }
  if (quoted) return null;
  if (field !== "" || record.length > 0) {
    if (!upload) return null;
    endRecord();
  }
  return out;
}
