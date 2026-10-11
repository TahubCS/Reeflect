import { describe, expect, it } from "vitest";
import {
  type CalendarFigures,
  type Facts,
  type FactsInput,
  buildFacts,
  completeDraft,
} from "@/features/agent/client";
import type { Measures } from "@/features/insights";
import { hasOwnDigits } from "@/lib/ai/digitScan";
import { labelsIn } from "@/lib/ai/fill";
import { cents } from "@/lib/money";
import { fallbackPanel } from "./fallback";
import {
  MAX_SUGGESTIONS,
  MAX_SUGGESTION_LENGTH,
  PANEL_SCHEMA,
  type Panel,
  completePanel,
} from "./panel";
import { PANEL_INSTRUCTION, panelRequest } from "./prompt";

// F-15: the dashboard's summary panel, from the agent's own figures.

const accounts: FactsInput["accounts"] = [
  { type: "checking", nickname: "Everyday 4417", balance: cents(150_025) },
  { type: "credit_card", nickname: "Quicksilver", balance: cents(-32_010) },
];

const measures: Measures = {
  coveredDays: 30,
  takeHome: cents(320_000),
  spending: cents(245_050),
  kept: cents(74_950),
  saved: cents(20_000),
  bills: cents(120_000),
  subscriptionCost: cents(2_598),
  subscriptionCount: 2,
  noSpendDays: 9,
  lowestBalance: cents(41_200),
  byCategory: { housing: cents(110_000), groceries: cents(48_050) },
};

/** Dining is past its budget; Groceries has money left. */
const month: NonNullable<FactsInput["month"]> = {
  totalSpending: cents(60_055),
  categories: [
    {
      name: "Groceries",
      spent: cents(38_815),
      allocation: cents(50_000),
      remaining: cents(11_185),
    },
    {
      name: "Dining",
      spent: cents(21_240),
      allocation: cents(20_000),
      remaining: cents(-1_240),
    },
  ],
};

const noPayday: CalendarFigures = {
  payday: null,
  dueTotal: cents(0),
  dueCount: 0,
  upcoming: [],
  freeToSpend: cents(150_025),
  perDay: cents(0),
  suggestions: 2,
};

const payday: CalendarFigures = {
  payday: { writtenOut: "Thursday, October 15", daysAway: 4 },
  dueTotal: cents(31_000),
  dueCount: 1,
  upcoming: [
    { name: "Rent", writtenOut: "Tuesday, October 13", amount: cents(-31_000) },
  ],
  freeToSpend: cents(119_025),
  perDay: cents(29_756),
  suggestions: 0,
};

const facts = (changes: Partial<FactsInput> = {}): Facts =>
  buildFacts({
    accounts,
    calendar: payday,
    month,
    measures,
    categoryNames: { housing: "Housing", groceries: "Groceries" },
    ...changes,
  });

const answer = (panel: unknown) => JSON.stringify(panel);

describe("completePanel", () => {
  it("fills a draft that follows the rules", () => {
    expect(
      completePanel(
        answer({
          summary:
            "You have {cash_total}, and {per_day} a day until your payday on {payday_date}.",
          suggestions: [
            "Your subscriptions come to about {subscription_yearly} a year.",
            "{category_2_name} is {category_2_over} past its budget this month.",
          ],
        }),
        facts(),
      ),
    ).toEqual({
      ok: true,
      panel: {
        summary:
          "You have $1,500.25, and $297.56 a day until your payday on Thursday, October 15.",
        suggestions: [
          "Your subscriptions come to about $311.76 a year.",
          "Dining is $12.40 past its budget this month.",
        ],
      },
    });
  });

  it("accepts a summary with no suggestions", () => {
    expect(
      completePanel(
        answer({ summary: "You have {cash_total}.", suggestions: [] }),
        facts(),
      ),
    ).toEqual({
      ok: true,
      panel: { summary: "You have $1,500.25.", suggestions: [] },
    });
  });

  it("rejects an answer that is not JSON, or not the shape asked for", () => {
    expect(completePanel("You have {cash_total}.", facts())).toEqual({
      ok: false,
      reason: "not_json",
    });
    for (const wrong of [
      { summary: "You have {cash_total}." },
      { summary: "  ", suggestions: [] },
      { summary: "You have {cash_total}.", suggestions: [""] },
      { summary: ["You have {cash_total}."], suggestions: [] },
      null,
    ]) {
      expect(completePanel(answer(wrong), facts())).toEqual({
        ok: false,
        reason: "wrong_shape",
      });
    }
  });

  it("rejects the whole answer when any sentence breaks a rule", () => {
    const good = "You have {cash_total}.";
    const cases: [Panel, string][] = [
      [{ summary: "You have $1,500.", suggestions: [] }, "digits"],
      [{ summary: good, suggestions: ["Save 10% more."] }, "digits"],
      [{ summary: good, suggestions: ["{net_worth} is up."] }, "unknown_label"],
      [{ summary: good, suggestions: ["Look at {this}"] }, "unknown_label"],
      [{ summary: good, suggestions: ["Look at { this }."] }, "stray_brace"],
      [
        { summary: good, suggestions: ["You spend {spending}."] },
        "average_not_called_monthly",
      ],
      [
        {
          summary: good,
          suggestions: ["Subscriptions: {subscription_yearly}."],
        },
        "yearly_not_called_a_year",
      ],
      [
        { summary: good, suggestions: ["You have {over_budget_count}."] },
        "month_to_date_not_called_this_month",
      ],
      [
        { summary: good, suggestions: ["a".repeat(MAX_SUGGESTION_LENGTH + 1)] },
        "too_long",
      ],
    ];
    for (const [panel, reason] of cases) {
      expect(completePanel(answer(panel), facts())).toEqual({
        ok: false,
        reason,
      });
    }
  });

  it("keeps the first three suggestions and never reads a fourth", () => {
    const checked = completePanel(
      answer({
        summary: "You have {cash_total}.",
        // The fourth would be rejected for its digit if it were read.
        suggestions: ["One.", "Two.", "Three.", "Save 10% more."],
      }),
      facts(),
    );

    expect(checked).toEqual({
      ok: true,
      panel: {
        summary: "You have $1,500.25.",
        suggestions: ["One.", "Two.", "Three."],
      },
    });
  });
});

/** The code-built panel, checked and filled as a model's would be. */
function built(from: Facts): Panel {
  const panel = fallbackPanel(from);
  if (panel === null) throw new Error("no panel");
  const fill = (draft: string) => {
    expect(hasOwnDigits(draft)).toBe(false);
    const checked = completeDraft(draft, from);
    if (!checked.ok) throw new Error(`${draft}: ${checked.reason}`);
    expect(checked.text).not.toMatch(/[{}]/);
    return checked.text;
  };
  expect(panel.suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
  return {
    summary: fill(panel.summary),
    suggestions: panel.suggestions.map(fill),
  };
}

describe("fallbackPanel", () => {
  it("has no panel without accounts", () => {
    expect(fallbackPanel(facts({ accounts: [] }))).toBeNull();
  });

  it("says where the person stands, with the calendar's figures first", () => {
    expect(built(facts())).toEqual({
      summary:
        "You have $1,500.25 in checking and savings and owe $320.10 on cards and loans. " +
        "$310.00 is due before your next payday on Thursday, October 15, 4 days away, which leaves $297.56 a day until then. " +
        "Based on the last 30 days, about $3,200.00 comes in and $2,450.50 goes out a month. That leaves about $749.50 a month. " +
        "You have spent $600.55 so far this month.",
      suggestions: [
        "Dining is $12.40 past its budget this month. The Budgets page shows every category.",
        "You pay for 2 subscriptions, which comes to about $311.76 a year. The Recurring payments page lists each one.",
        "The most goes to Housing, about $1,100.00 a month.",
      ],
    });
  });

  it("points to confirming a payday first when none is confirmed", () => {
    const panel = built(facts({ calendar: noPayday }));

    expect(panel.summary).not.toContain("payday");
    expect(panel.suggestions).toHaveLength(MAX_SUGGESTIONS);
    expect(panel.suggestions[0]).toBe(
      "Confirm your payday on the Recurring payments page to see what you can spend each day. It has 2 recurring payments to review.",
    );
  });

  it("says so plainly when bills use all of today's balance", () => {
    const panel = built(
      facts({ calendar: { ...payday, freeToSpend: cents(0) } }),
    );

    expect(panel.summary).toContain("which will use all of today's balance.");
    expect(panel.summary).not.toContain("a day until then");
  });

  it("states an overspend without blame", () => {
    const panel = built(
      facts({ measures: { ...measures, kept: cents(-5_000) } }),
    );

    expect(panel.summary).toContain(
      "That is about $50.00 a month more going out than coming in.",
    );
  });

  it("offers a first step when there is no activity yet", () => {
    expect(
      built(facts({ measures: null, month: undefined, calendar: noPayday })),
    ).toEqual({
      summary:
        "You have $1,500.25 in checking and savings and owe $320.10 on cards and loans. There are no transactions in the last thirty days yet.",
      suggestions: [
        "Confirm your payday on the Recurring payments page to see what you can spend each day. It has 2 recurring payments to review.",
        "Import a statement or add a transaction to see where your money goes.",
      ],
    });
  });

  it("leaves out what does not apply", () => {
    const panel = built(
      facts({
        accounts: [accounts[0]!],
        month: undefined,
        measures: {
          ...measures,
          kept: cents(0),
          subscriptionCount: 0,
          byCategory: {},
        },
      }),
    );

    expect(panel.summary).not.toContain("owe");
    expect(panel.summary).not.toContain("this month");
    expect(panel.suggestions).toEqual([]);
  });
});

describe("the panel's request", () => {
  it("asks for the panel's shape, with the agent's rules for figures", () => {
    const request = panelRequest(facts());

    expect(request.system).toBe(PANEL_INSTRUCTION);
    expect(request.schema).toBe(PANEL_SCHEMA);
    expect(PANEL_INSTRUCTION).toContain("Never write a digit.");
    expect(PANEL_INSTRUCTION).toContain("Never recommend a financial product");
  });

  it("holds no figure, nickname or payment name outside a label", () => {
    const { system, user } = panelRequest(facts());

    for (const text of [system, user]) {
      expect(hasOwnDigits(text)).toBe(false);
    }
    for (const secret of ["Everyday", "Quicksilver", "Rent", "$"]) {
      expect(user).not.toContain(secret);
    }
  });

  it("offers only labels that have values, and names what is past budget", () => {
    const from = facts();
    const { user } = panelRequest(from);
    const known = new Set([
      ...Object.keys(from.values),
      ...Object.keys(from.described),
    ]);

    expect(labelsIn(user).every((label) => known.has(label))).toBe(true);
    expect(user).toContain("{subscription_yearly}:");
    expect(user).toContain("{over_budget_count}:");
    expect(user).toContain("Past their budget this month: {category_2_name}.");
  });

  it("adds no budget line when nothing is past budget", () => {
    expect(panelRequest(facts({ month: undefined })).user).not.toContain(
      "Past their budget",
    );
  });
});
