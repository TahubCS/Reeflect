import { describe, expect, it } from "vitest";
import { type Cents, cents } from "@/lib/money";
import {
  type CheckContext,
  type CheckId,
  formatStatementDate,
  isBlocked,
  reconciliationDifference,
  runChecks,
} from "./checks";
import { toCsv } from "./csv";
import type { ParsedStatement } from "./statement";

const statement: ParsedStatement = {
  institution: "Capital One",
  productName: "360 Checking",
  accountTypes: ["checking"],
  accountLast4: "1234",
  currency: "USD",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  openingBalanceCents: cents(10000),
  closingBalanceCents: cents(11000),
  statedTotals: null,
  rows: [
    {
      postedOn: "2026-09-02",
      description: "Pay",
      amountCents: cents(2000),
      runningBalanceCents: cents(12000),
    },
    {
      postedOn: "2026-09-03",
      description: "Market",
      amountCents: cents(-1000),
      runningBalanceCents: cents(11000),
    },
  ],
};

function context(overrides: Partial<CheckContext> = {}): CheckContext {
  const s = overrides.statement ?? statement;
  return {
    statement: s,
    csv: toCsv(s.rows),
    account: {
      institutionName: "Capital One 360",
      maskLast4: "1234",
      type: "checking",
    },
    duplicateFile: false,
    duplicateRows: 0,
    previousImports: [],
    ...overrides,
  };
}

const find = (overrides: Partial<CheckContext>, id: CheckId) =>
  runChecks(context(overrides)).find((check) => check.id === id);

describe("runChecks", () => {
  it("passes a statement that matches its account and adds up", () => {
    const checks = runChecks(context());
    expect(isBlocked(checks)).toBe(false);
    expect(checks.map((check) => check.id)).toEqual([
      "identity",
      "account-type",
      "currency",
      "reconciliation",
      "running-balance",
      "csv",
      "duplicate-file",
      "duplicate-rows",
      "period",
    ]);
    expect(checks.every((check) => check.outcome === "pass")).toBe(true);
  });

  describe("identity", () => {
    it("blocks another bank or other last 4 digits, showing both", () => {
      const other = find(
        {
          account: {
            institutionName: "First Example Bank",
            maskLast4: "1234",
            type: "checking",
          },
        },
        "identity",
      );
      expect(other).toMatchObject({ outcome: "block" });
      expect(other!.detail).toContain("Capital One ••1234");
      expect(other!.detail).toContain("First Example Bank ••1234");
      expect(
        find(
          {
            account: {
              institutionName: "Capital One",
              maskLast4: "9999",
              type: "checking",
            },
          },
          "identity",
        )!.outcome,
      ).toBe("block");
      expect(
        find(
          {
            account: {
              institutionName: "!!",
              maskLast4: "1234",
              type: "checking",
            },
          },
          "identity",
        )!.outcome,
      ).toBe("block");
    });

    it("asks for the last 4 digits when the account has none", () => {
      const check = find(
        {
          account: {
            institutionName: "Capital One",
            maskLast4: null,
            type: "checking",
          },
        },
        "identity",
      );
      expect(check).toMatchObject({ outcome: "block" });
      expect(check!.detail).toContain("Add the account's last 4 digits");
    });
  });

  it("blocks a statement for another type of account, or an unknown one", () => {
    expect(
      find(
        {
          account: {
            institutionName: "Capital One",
            maskLast4: "1234",
            type: "savings",
          },
        },
        "account-type",
      )!.detail,
    ).toBe(
      "This is a checking statement, and the chosen account is a savings account.",
    );
    expect(
      find(
        {
          statement: { ...statement, accountTypes: [], productName: "360 CD" },
        },
        "account-type",
      )!.outcome,
    ).toBe("block");
  });

  it("blocks a currency other than US dollars", () => {
    const euro = {
      ...statement,
      currency: "EUR",
    } as unknown as ParsedStatement;
    expect(find({ statement: euro }, "currency")!.outcome).toBe("block");
  });

  it("blocks when the balances don't add up, naming the difference", () => {
    const check = find(
      { statement: { ...statement, closingBalanceCents: cents(11001) } },
      "reconciliation",
    );
    expect(check!.outcome).toBe("block");
    expect(check!.detail).toContain("a difference of $0.01");
  });

  it("says transaction for a single row", () => {
    const one = {
      ...statement,
      closingBalanceCents: cents(12000),
      rows: statement.rows.slice(0, 1),
    };
    expect(find({ statement: one }, "reconciliation")!.detail).toContain(
      "plus 1 transaction totalling",
    );
  });

  describe("running balance", () => {
    it("blocks a printed balance that doesn't follow, and names the row", () => {
      const rows = [
        statement.rows[0]!,
        { ...statement.rows[1]!, runningBalanceCents: cents(11500) },
      ];
      const check = find(
        { statement: { ...statement, rows } },
        "running-balance",
      );
      expect(check!.outcome).toBe("block");
      expect(check!.detail).toContain('After "Market" on September 3, 2026');
    });

    it("skips rows without a printed balance, and the whole check when none has one", () => {
      const rows = [
        { ...statement.rows[0]!, runningBalanceCents: null },
        statement.rows[1]!,
      ];
      expect(
        find({ statement: { ...statement, rows } }, "running-balance")!.outcome,
      ).toBe("pass");
      const none = statement.rows.map((row) => ({
        ...row,
        runningBalanceCents: null,
      }));
      expect(
        find({ statement: { ...statement, rows: none } }, "running-balance"),
      ).toBeUndefined();
    });
  });

  it("compares stated totals when the statement prints them", () => {
    const totals = (credits: number, debits: number) => ({
      statement: {
        ...statement,
        statedTotals: {
          creditsCents: cents(credits),
          debitsCents: cents(debits),
        },
      },
    });
    expect(find(totals(2000, -1000), "stated-totals")!.outcome).toBe("pass");
    expect(find(totals(2000, -999), "stated-totals")!.outcome).toBe("block");
  });

  describe("saved copy", () => {
    it("blocks a CSV that differs from the rows", () => {
      const edited = toCsv([
        statement.rows[0]!,
        { ...statement.rows[1]!, amountCents: cents(-1001) },
      ]);
      expect(find({ csv: edited }, "csv")).toMatchObject({
        outcome: "block",
        detail: "The saved copy of the rows differs from the statement.",
      });
      expect(
        find({ csv: toCsv(statement.rows.slice(0, 1)) }, "csv")!.outcome,
      ).toBe("block");
    });

    it("blocks a CSV that can't be read back", () => {
      expect(find({ csv: "nonsense" }, "csv")!.detail).toContain(
        "can't be read back",
      );
    });
  });

  it("blocks a file already imported to the account", () => {
    expect(find({ duplicateFile: true }, "duplicate-file")!.outcome).toBe(
      "block",
    );
  });

  it("counts transactions already on the account", () => {
    expect(find({ duplicateRows: 1 }, "duplicate-rows")!.detail).toBe(
      "1 transaction is already on this account and will be skipped; 1 will be added.",
    );
    expect(find({ duplicateRows: 2 }, "duplicate-rows")!.detail).toContain(
      "2 transactions are",
    );
  });

  describe("period and continuity", () => {
    const earlier = (start: string, end: string, closing: number) => ({
      periodStart: start,
      periodEnd: end,
      closingBalanceCents: cents(closing) as Cents,
    });

    it("notes an overlap with an earlier import", () => {
      const check = find(
        { previousImports: [earlier("2026-08-15", "2026-09-10", 0)] },
        "period",
      );
      expect(check!.outcome).toBe("pass");
      expect(check!.detail).toContain("overlaps an earlier import");
    });

    it("warns about a gap since the last import", () => {
      const check = find(
        { previousImports: [earlier("2026-07-01", "2026-07-31", 10000)] },
        "period",
      );
      expect(check!.outcome).toBe("warn");
      expect(
        find(
          { previousImports: [earlier("2026-07-01", "2026-07-31", 10000)] },
          "continuity",
        ),
      ).toBeUndefined();
    });

    it("checks the opening balance against the statement just before", () => {
      const imports = [
        earlier("2026-07-01", "2026-07-31", 1),
        earlier("2026-08-01", "2026-08-31", 10000),
      ];
      expect(find({ previousImports: imports }, "continuity")!.outcome).toBe(
        "pass",
      );
      expect(
        find(
          { previousImports: [earlier("2026-08-01", "2026-08-31", 9000)] },
          "continuity",
        )!.outcome,
      ).toBe("warn");
    });

    it("ignores imports after this statement", () => {
      expect(
        find(
          { previousImports: [earlier("2026-10-01", "2026-10-31", 0)] },
          "period",
        )!.detail,
      ).toBe("September 1, 2026 to September 30, 2026.");
    });
  });

  describe("a CSV export", () => {
    const deposit: ParsedStatement = {
      ...statement,
      productName: "360 account",
      accountTypes: ["checking", "savings"],
    };
    const card: ParsedStatement = {
      ...statement,
      productName: "Credit card",
      accountTypes: ["credit_card"],
      openingBalanceCents: null,
      closingBalanceCents: null,
      rows: statement.rows.map((row) => ({
        ...row,
        runningBalanceCents: null,
      })),
    };
    const cardAccount = {
      institutionName: "Capital One",
      maskLast4: "1234",
      type: "credit_card" as const,
    };

    it("accepts any of the account types the export can belong to", () => {
      for (const type of ["checking", "savings"] as const) {
        expect(
          find(
            { statement: deposit, account: { ...cardAccount, type } },
            "account-type",
          )!.outcome,
        ).toBe("pass");
      }
      expect(
        find({ statement: deposit, account: cardAccount }, "account-type")!
          .detail,
      ).toBe(
        "This is a checking or savings statement, and the chosen account is a credit card account.",
      );
    });

    it("skips the balance checks when the file has no balances", () => {
      const checks = runChecks(
        context({
          statement: card,
          account: cardAccount,
          previousImports: [
            {
              periodStart: "2026-08-01",
              periodEnd: "2026-08-31",
              closingBalanceCents: cents(5000),
            },
          ],
        }),
      );
      expect(checks.map((check) => check.id)).toEqual([
        "identity",
        "account-type",
        "currency",
        "csv",
        "duplicate-file",
        "duplicate-rows",
        "period",
      ]);
      expect(isBlocked(checks)).toBe(false);
    });

    it("skips continuity after an import that had no balances", () => {
      expect(
        find(
          {
            previousImports: [
              {
                periodStart: "2026-08-01",
                periodEnd: "2026-08-31",
                closingBalanceCents: null,
              },
            ],
          },
          "continuity",
        ),
      ).toBeUndefined();
    });
  });
});

describe("helpers", () => {
  it("computes the reconciliation difference to the cent", () => {
    expect(
      reconciliationDifference(cents(100), [cents(50), cents(-25)], cents(126)),
    ).toBe(1);
  });

  it("formats statement dates without a time zone shift", () => {
    expect(formatStatementDate("2026-01-01")).toBe("January 1, 2026");
  });
});
