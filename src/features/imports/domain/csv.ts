import { parseDecimalString, toDecimalString } from "@/lib/money";
import type { StatementRow } from "./statement";

// The canonical CSV every import stores (ADR-053): one row per transaction,
// RFC 4180 quoting, CRLF line ends. Amounts are plain decimals from
// `src/lib/money`. `parseCsv` reads back only what `toCsv` writes, so the
// stored file can be checked against the rows it came from.

export const CSV_HEADER = "posted_on,description,amount,running_balance";

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function quote(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

export function toCsv(rows: readonly StatementRow[]): string {
  const lines = rows.map((row) =>
    [
      row.postedOn,
      quote(row.description),
      toDecimalString(row.amountCents),
      row.runningBalanceCents === null
        ? ""
        : toDecimalString(row.runningBalanceCents),
    ].join(","),
  );
  return [CSV_HEADER, ...lines].join("\r\n") + "\r\n";
}

/** Splits RFC 4180 text into records of fields. Null on unbalanced quotes. */
function records(text: string): string[][] | null {
  const out: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
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
      record.push(field);
      out.push(record);
      record = [];
      field = "";
      i += 1;
    } else field += char;
    i += 1;
  }
  if (quoted || field !== "" || record.length > 0) return null;
  return out;
}

export type CsvResult =
  { ok: true; rows: StatementRow[] } | { ok: false; error: string };

export function parseCsv(text: string): CsvResult {
  const parsed = records(text);
  if (!parsed) return { ok: false, error: "The file does not end cleanly." };
  const [header, ...body] = parsed;
  if (header?.join(",") !== CSV_HEADER) {
    return { ok: false, error: "The header row is not the expected one." };
  }
  const rows: StatementRow[] = [];
  for (const [index, fields] of body.entries()) {
    const line = index + 2;
    if (fields.length !== 4) {
      return { ok: false, error: `Line ${line} does not have 4 fields.` };
    }
    const [postedOn, description, amount, balance] = fields as [
      string,
      string,
      string,
      string,
    ];
    const amountCents = parseDecimalString(amount);
    const runningBalanceCents =
      balance === "" ? null : parseDecimalString(balance);
    if (
      !ISO_DATE.test(postedOn) ||
      amountCents === null ||
      (balance !== "" && runningBalanceCents === null)
    ) {
      return {
        ok: false,
        error: `Line ${line} has a value that can't be read.`,
      };
    }
    rows.push({ postedOn, description, amountCents, runningBalanceCents });
  }
  return { ok: true, rows };
}
