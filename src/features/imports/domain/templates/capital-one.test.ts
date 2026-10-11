import { describe, expect, it } from "vitest";
import { parseStatement } from "../parse";
import { type Line, toLines } from "../text";

// Hand-built lines at the positions of Capital One's sample eStatement, for
// the cases the fixture PDFs don't reach.

type Cells = [x: number, text: string][];

let y = 800;
const at = (cells: Cells, page = 1) =>
  cells.map(([x, text]) => ({ page, x, y, text }));
function lines(...rows: Cells[]): Line[] {
  y = 800;
  return toLines(
    rows.flatMap((cells) => {
      y -= 13;
      return at(cells);
    }),
  );
}

const BRAND: Cells = [[344, "Thanks for saving with Capital One 360"]];
const TITLE: Cells = [[65, "Your 360 Savings Activity"]];
const ACCOUNT: Cells = [
  [54, "Account: 12345678 Current Interest Rate: 2.467%"],
];
const HEADER: Cells = [
  [54, "Activity"],
  [374, "Date"],
  [457, "Amount"],
  [531, "Balance"],
];
const OPEN: Cells = [
  [55, "Opening Balance"],
  [361, "01/01/2013"],
  [521, "$1,186.93"],
];
const ROW: Cells = [
  [55, "Monthly Interest Paid"],
  [361, "01/31/2013"],
  [461, "$2.49"],
  [521, "$1,189.42"],
];
const CLOSE: Cells = [
  [55, "Closing Balance"],
  [361, "03/31/2013"],
  [521, "$1,189.42"],
];

const parse = (input: Line[], last4: string | null = "5678") =>
  parseStatement(input, last4);

describe("parseCapitalOne", () => {
  it("reads the sample layout", () => {
    const result = parse(
      lines(BRAND, TITLE, ACCOUNT, HEADER, OPEN, ROW, CLOSE),
    );
    expect(result).toMatchObject({
      ok: true,
      statement: {
        productName: "360 Savings",
        accountType: "savings",
        accountLast4: "5678",
        periodStart: "2013-01-01",
        periodEnd: "2013-03-31",
        rows: [
          {
            postedOn: "2013-01-31",
            description: "Monthly Interest Paid",
            amountCents: 249,
            runningBalanceCents: 118942,
          },
        ],
      },
    });
  });

  it("reads the only account when the target has no last 4 digits", () => {
    const result = parse(
      lines(BRAND, TITLE, ACCOUNT, HEADER, OPEN, CLOSE),
      null,
    );
    expect(result.ok && result.statement.accountLast4).toBe("5678");
  });

  it("knows checking and money market products, and leaves others unknown", () => {
    const named = (title: string) => {
      const result = parse(
        lines(
          BRAND,
          [[65, `Your ${title} Activity`]],
          ACCOUNT,
          HEADER,
          OPEN,
          CLOSE,
        ),
      );
      return result.ok ? result.statement.accountType : "failed";
    };
    expect(named("360 Checking")).toBe("checking");
    expect(named("360 Money Market")).toBe("savings");
    expect(named("360 CD")).toBeNull();
  });

  it("keeps a long description that reaches toward the date column", () => {
    const result = parse(
      lines(
        BRAND,
        TITLE,
        ACCOUNT,
        HEADER,
        OPEN,
        [
          [55, "Deposit from SAMPLE"],
          [230, "PAYROLL COMPANY"],
          [361, "01/31/2013"],
          [461, "$2.49"],
          [521, "$1,189.42"],
        ],
        CLOSE,
      ),
    );
    expect(result.ok && result.statement.rows[0]!.description).toBe(
      "Deposit from SAMPLE PAYROLL COMPANY",
    );
  });

  it("skips page furniture between rows and stops at the closing balance", () => {
    const result = parse(
      lines(
        BRAND,
        TITLE,
        ACCOUNT,
        HEADER,
        OPEN,
        [[200, "continued on next page"]],
        HEADER,
        ROW,
        CLOSE,
        ROW,
      ),
    );
    expect(result.ok && result.statement.rows).toHaveLength(1);
  });

  it.each([
    ["no activity section", [BRAND, HEADER, OPEN, CLOSE], "malformed"],
    [
      "a title without an account line",
      [BRAND, TITLE, HEADER, OPEN, CLOSE],
      "malformed",
    ],
    ["no table header", [BRAND, TITLE, ACCOUNT, OPEN, CLOSE], "malformed"],
    [
      "no closing balance",
      [BRAND, TITLE, ACCOUNT, HEADER, OPEN, ROW],
      "malformed",
    ],
    [
      "no opening balance before a row",
      [BRAND, TITLE, ACCOUNT, HEADER, ROW, CLOSE],
      "malformed",
    ],
    [
      "an unreadable opening balance",
      [
        BRAND,
        TITLE,
        ACCOUNT,
        HEADER,
        [
          [55, "Opening Balance"],
          [361, "01/01/2013"],
          [521, "lots"],
        ],
        CLOSE,
      ],
      "malformed",
    ],
    [
      "an unreadable closing balance",
      [
        BRAND,
        TITLE,
        ACCOUNT,
        HEADER,
        OPEN,
        [
          [55, "Closing Balance"],
          [361, "13/45/2013"],
          [521, "$1.00"],
        ],
      ],
      "malformed",
    ],
    [
      "an unreadable amount in a row",
      [
        BRAND,
        TITLE,
        ACCOUNT,
        HEADER,
        OPEN,
        [
          [55, "Interest"],
          [361, "01/31/2013"],
          [461, "$2.49"],
          [521, "n/a"],
        ],
        CLOSE,
      ],
      "malformed",
    ],
  ] as [string, Cells[], string][])("fails on %s", (_name, rows, reason) => {
    expect(parse(lines(...rows))).toMatchObject({ ok: false, reason });
  });

  it("treats an impossible date as part of the description", () => {
    const result = parse(
      lines(
        BRAND,
        TITLE,
        ACCOUNT,
        HEADER,
        OPEN,
        [
          [55, "Interest"],
          [361, "02/30/2013"],
          [461, "$2.49"],
          [521, "$1,189.42"],
        ],
        CLOSE,
      ),
    );
    expect(result.ok && result.statement.rows).toEqual([]);
  });

  it("explains which accounts the statement has when the target isn't one", () => {
    expect(
      parse(lines(BRAND, TITLE, ACCOUNT, HEADER, OPEN, CLOSE), "0000"),
    ).toMatchObject({
      ok: false,
      reason: "no-account",
      accountsFound: ["5678"],
    });
  });
});

describe("parseStatement", () => {
  it("does not guess at a bank it has no template for", () => {
    expect(
      parse(
        lines(
          [[59, "First Example Bank"]],
          TITLE,
          ACCOUNT,
          HEADER,
          OPEN,
          CLOSE,
        ),
      ),
    ).toMatchObject({
      ok: false,
      reason: "unsupported",
    });
  });
});
