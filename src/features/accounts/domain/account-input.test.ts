import { describe, expect, it } from "vitest";
import { ACCOUNT_TYPES } from "@/lib/db/schema/finance";
import { cents } from "@/lib/money";
import {
  ACCOUNT_TYPE_OPTIONS,
  accountIdSchema,
  balanceLabel,
  displayedBalance,
  isoDateIn,
  owesMoney,
  parseAccountForm,
} from "./account-input";

const EDITABLE = { balanceEditable: true };

const form = (overrides: Record<string, unknown> = {}) => ({
  type: "checking",
  institutionName: "  Capital One ",
  nickname: " Everyday ",
  maskLast4: "1234",
  balance: "1,204.50",
  ...overrides,
});

describe("account types", () => {
  it("offers exactly the types the database accepts", () => {
    expect([...ACCOUNT_TYPE_OPTIONS].sort()).toEqual([...ACCOUNT_TYPES].sort());
  });

  it("treats cards and loans as money owed", () => {
    expect(owesMoney("credit_card")).toBe(true);
    expect(owesMoney("loan")).toBe(true);
    expect(owesMoney("checking")).toBe(false);
    expect(owesMoney("savings")).toBe(false);
    expect(balanceLabel("loan")).toBe("Amount owed");
    expect(balanceLabel("savings")).toBe("Current balance");
  });
});

describe("parseAccountForm", () => {
  it("trims the text and keeps a checking balance as typed", () => {
    expect(parseAccountForm(form(), EDITABLE)).toEqual({
      ok: true,
      value: {
        type: "checking",
        institutionName: "Capital One",
        nickname: "Everyday",
        maskLast4: "1234",
        balanceCents: 120450,
      },
    });
  });

  it("allows an overdrawn checking account and a zero balance", () => {
    const overdrawn = parseAccountForm(form({ balance: "-35.10" }), EDITABLE);
    const empty = parseAccountForm(form({ balance: "0" }), EDITABLE);

    expect(overdrawn.ok && overdrawn.value.balanceCents).toBe(-3510);
    expect(empty.ok && empty.value.balanceCents).toBe(0);
  });

  it.each(["credit_card", "loan"])(
    "stores what is owed on a %s as negative (ADR-008)",
    (type) => {
      const parsed = parseAccountForm(form({ type, balance: "300" }), EDITABLE);

      expect(parsed.ok && parsed.value.balanceCents).toBe(-30000);
    },
  );

  it("asks for the amount owed without a minus sign", () => {
    expect(
      parseAccountForm(
        form({ type: "credit_card", balance: "-300" }),
        EDITABLE,
      ),
    ).toEqual({
      ok: false,
      errors: { balance: "Enter the amount owed without a minus sign." },
    });
  });

  it("treats a blank last-4 as none", () => {
    const parsed = parseAccountForm(form({ maskLast4: " " }), EDITABLE);

    expect(parsed.ok && parsed.value.maskLast4).toBeNull();
  });

  it.each(["123", "12345", "1234567890123456", "12a4"])(
    "rejects %j as the last 4 digits",
    (maskLast4) => {
      expect(parseAccountForm(form({ maskLast4 }), EDITABLE)).toEqual({
        ok: false,
        errors: {
          maskLast4: "Enter only the last 4 digits, or leave it blank.",
        },
      });
    },
  );

  it("reports every wrong field at once, one message each", () => {
    expect(
      parseAccountForm(
        {
          type: "brokerage",
          institutionName: "",
          nickname: "x".repeat(61),
          balance: "lots",
        },
        EDITABLE,
      ),
    ).toEqual({
      ok: false,
      errors: {
        type: "Choose an account type.",
        institutionName: "Enter the bank or card issuer.",
        nickname: "Use 60 characters or fewer.",
        balance: "Enter an amount like 1,204.50.",
      },
    });
  });

  it("explains missing fields and a missing balance", () => {
    expect(parseAccountForm({}, EDITABLE)).toEqual({
      ok: false,
      errors: {
        type: "Choose an account type.",
        institutionName: "Enter the bank or card issuer.",
        nickname: "Give the account a name you'll recognize.",
        balance: "Enter an amount like 1,204.50.",
      },
    });
    expect(parseAccountForm(null, EDITABLE).ok).toBe(false);
  });

  it("ignores the balance of a synced account", () => {
    const parsed = parseAccountForm(form({ balance: "nonsense" }), {
      balanceEditable: false,
    });

    expect(parsed.ok && parsed.value.balanceCents).toBeNull();
  });
});

describe("displayedBalance", () => {
  it("shows what is owed on a card or loan as a plain amount", () => {
    expect(displayedBalance("credit_card", cents(-30000))).toBe("$300.00");
    expect(displayedBalance("loan", cents(0))).toBe("$0.00");
  });

  it("shows a checking or savings balance with its sign", () => {
    expect(displayedBalance("checking", cents(120450))).toBe("$1,204.50");
    expect(displayedBalance("savings", cents(-3510))).toBe("-$35.10");
  });

  it("round-trips through the form for every type", () => {
    for (const [type, stored] of [
      ["checking", -3510],
      ["credit_card", -30000],
    ] as const) {
      const parsed = parseAccountForm(
        form({ type, balance: displayedBalance(type, cents(stored)) }),
        EDITABLE,
      );
      expect(parsed.ok && parsed.value.balanceCents).toBe(stored);
    }
  });
});

describe("accountIdSchema", () => {
  it("accepts our UUID v7 ids and nothing else", () => {
    expect(
      accountIdSchema.safeParse("01a127d3-45df-7084-aad6-a933d10fd577").success,
    ).toBe(true);
    expect(accountIdSchema.safeParse("1; drop table").success).toBe(false);
  });
});

describe("isoDateIn", () => {
  it("uses the given time zone's calendar day", () => {
    // 02:30 UTC on Oct 11 is still Oct 10 in New York.
    const now = new Date("2026-10-11T02:30:00Z");

    expect(isoDateIn(now, "America/New_York")).toBe("2026-10-10");
    expect(isoDateIn(now, "UTC")).toBe("2026-10-11");
  });
});
