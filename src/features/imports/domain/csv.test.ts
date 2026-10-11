import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import { CSV_HEADER, parseCsv, toCsv } from "./csv";
import type { StatementRow } from "./statement";

const rows: StatementRow[] = [
  {
    postedOn: "2026-09-01",
    description: "Payroll",
    amountCents: cents(145000),
    runningBalanceCents: cents(339000),
  },
  {
    postedOn: "2026-09-03",
    description: "Rent Payment, Unit 4B",
    amountCents: cents(-120000),
    runningBalanceCents: cents(219000),
  },
  {
    postedOn: "2026-09-05",
    description: 'Zelle from "Sam"',
    amountCents: cents(2500),
    runningBalanceCents: null,
  },
  {
    postedOn: "2026-09-06",
    description: "Café ☕ line\nbreak",
    amountCents: cents(-5),
    runningBalanceCents: cents(0),
  },
  {
    postedOn: "2026-09-07",
    description: "",
    amountCents: cents(0),
    runningBalanceCents: cents(-1),
  },
];

describe("toCsv", () => {
  it("writes the header, quotes only where needed and ends lines with CRLF", () => {
    const csv = toCsv(rows.slice(0, 3));
    expect(csv).toBe(
      [
        CSV_HEADER,
        "2026-09-01,Payroll,1450.00,3390.00",
        '2026-09-03,"Rent Payment, Unit 4B",-1200.00,2190.00',
        '2026-09-05,"Zelle from ""Sam""",25.00,',
        "",
      ].join("\r\n"),
    );
  });

  it("writes just the header for a statement with no rows", () => {
    expect(toCsv([])).toBe(`${CSV_HEADER}\r\n`);
  });
});

describe("parseCsv", () => {
  it("reads back exactly what toCsv wrote", () => {
    expect(parseCsv(toCsv(rows))).toEqual({ ok: true, rows });
    expect(parseCsv(toCsv([]))).toEqual({ ok: true, rows: [] });
  });

  it.each([
    ["an unclosed quote", `${CSV_HEADER}\r\n2026-09-01,"Payroll,1.00,\r\n`],
    ["a missing final line end", `${CSV_HEADER}\r\n2026-09-01,Payroll,1.00,`],
    ["another header", "date,description,amount\r\n"],
    ["too few fields", `${CSV_HEADER}\r\n2026-09-01,Payroll,1.00\r\n`],
    ["a bad date", `${CSV_HEADER}\r\n2026-13-01,Payroll,1.00,\r\n`],
    ["a dollar sign", `${CSV_HEADER}\r\n2026-09-01,Payroll,$1.00,\r\n`],
    ["a bad balance", `${CSV_HEADER}\r\n2026-09-01,Payroll,1.00,1.5\r\n`],
  ])("rejects %s", (_name, text) => {
    expect(parseCsv(text).ok).toBe(false);
  });

  it("names the line that can't be read", () => {
    expect(
      parseCsv(
        `${CSV_HEADER}\r\n2026-09-01,Payroll,1.00,\r\n2026-09-02,X,1,\r\n`,
      ),
    ).toEqual({
      ok: false,
      error: "Line 3 has a value that can't be read.",
    });
  });
});
