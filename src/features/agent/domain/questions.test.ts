import { describe, expect, it } from "vitest";
import { hasOwnDigits } from "@/lib/ai/digitScan";
import { labelsIn, withoutLabels } from "@/lib/ai/fill";
import { cents } from "@/lib/money";
import { CHAT_REPLIES } from "./chat";
import { completeDraft } from "./draft";
import { fallbackDraft } from "./fallback";
import { SYSTEM_INSTRUCTION, buildUserInput } from "./prompt";
import {
  type CalendarFigures,
  type Facts,
  type FactsInput,
  LABELS,
  MONTHLY_LABELS,
  type MonthFigures,
  buildFacts,
  isMonthToDate,
  valuesOf,
} from "./summary";

// F-28: this month's categories and budgets, the next payments and each
// account, as labels, and the code-built reply to a question about them.

const accounts: FactsInput["accounts"] = [
  { type: "checking", nickname: "Everyday", balance: cents(150_025) },
  { type: "savings", nickname: "Rainy Day", balance: cents(400_000) },
  { type: "credit_card", nickname: "Quicksilver", balance: cents(-32_010) },
  { type: "loan", nickname: "Corolla", balance: cents(-1_200_000) },
];

const category = (
  name: string,
  spent: number,
  allocation: number | null = null,
): MonthFigures["categories"][number] => ({
  name,
  spent: cents(spent),
  allocation: allocation === null ? null : cents(allocation),
  remaining: allocation === null ? null : cents(allocation - spent),
});

/** Groceries with money left, Dining over, Transport without a budget. */
const month: MonthFigures = {
  totalSpending: cents(71_055),
  categories: [
    category("Dining", 21_240, 20_000),
    category("Groceries", 38_815, 50_000),
    category("Transport", 9_000),
    category("Travel", 0),
    category("Gifts", 0, 5_000),
    category("Health", 2_000, 2_000),
  ],
};

const due = (name: string, writtenOut: string, amount: number) => ({
  name,
  writtenOut,
  amount: cents(amount),
});

const noPayday: CalendarFigures = {
  payday: null,
  dueTotal: cents(0),
  dueCount: 0,
  upcoming: [],
  freeToSpend: cents(550_025),
  perDay: cents(0),
  suggestions: 0,
};

const payday = (upcoming: CalendarFigures["upcoming"]): CalendarFigures => ({
  payday: { writtenOut: "Friday, October 23", daysAway: 12 },
  dueTotal: cents(upcoming.reduce((sum, item) => sum - item.amount, 0)),
  dueCount: upcoming.length,
  upcoming,
  freeToSpend: cents(400_000),
  perDay: cents(33_333),
  suggestions: 0,
});

const twoDue = payday([
  due("Rent", "Thursday, October 15", -120_000),
  due("Netflix", "Saturday, October 17", -1_599),
]);

const facts = (changes: Partial<FactsInput> = {}): Facts =>
  buildFacts({
    accounts,
    calendar: twoDue,
    month,
    measures: null,
    categoryNames: {},
    ...changes,
  });

/** The code-built reply to a text, checked and filled as a model's would be. */
function reply(text: string, from: Facts = facts()): string {
  const draft = fallbackDraft(from, text);
  expect(hasOwnDigits(draft)).toBe(false);
  const checked = completeDraft(draft, from);
  if (!checked.ok) throw new Error(`${text}: ${checked.reason}`);
  expect(checked.text).not.toMatch(/[{}]/);
  return checked.text;
}

describe("this month's categories", () => {
  it("lists those with spending or a budget, largest spending first", () => {
    const { categories, described } = facts();

    expect(categories).toEqual([
      { name: "Groceries", budget: "left" },
      { name: "Dining", budget: "over" },
      { name: "Transport", budget: "none" },
      { name: "Health", budget: "used" },
      { name: "Gifts", budget: "left" },
    ]);
    expect(described.category_1_name!.value).toBe("Groceries");
    expect(described.category_1_spent!.value).toBe("$388.15");
    expect(described.category_2_name!.value).toBe("Dining");
    expect(described.category_2_spent!.value).toBe("$212.40");
    // Travel has neither spending nor a budget.
    expect(described.category_6_name).toBeUndefined();
  });

  it("gives the budget, and what is left or over, only when it applies", () => {
    const values = valuesOf(facts());

    expect(values).toMatchObject({
      category_1_budget: "$500.00",
      category_1_left: "$111.85",
      category_2_budget: "$200.00",
      // Over is a positive amount.
      category_2_over: "$12.40",
      category_4_budget: "$20.00",
      category_5_spent: "$0.00",
      category_5_left: "$50.00",
      month_spent: "$710.55",
    });
    for (const absent of [
      "category_1_over",
      "category_2_left",
      "category_3_budget",
      "category_3_left",
      "category_3_over",
      // Used exactly: neither left nor over.
      "category_4_left",
      "category_4_over",
    ]) {
      expect(values).not.toHaveProperty(absent);
    }
  });

  it("breaks a tie in spending by name", () => {
    const tied = facts({
      month: {
        totalSpending: cents(2_000),
        categories: [category("Travel", 1_000), category("Gifts", 1_000)],
      },
    });

    expect(tied.categories.map(({ name }) => name)).toEqual([
      "Gifts",
      "Travel",
    ]);
  });

  it("stops at twelve", () => {
    const many = facts({
      month: {
        totalSpending: cents(100_000),
        categories: Array.from({ length: 15 }, (_, index) =>
          category(`Category ${"abcdefghijklmno"[index]}`, 1_000 + index),
        ),
      },
    });

    expect(many.categories).toHaveLength(12);
    expect(many.described.category_12_spent!.value).toBe("$10.03");
    expect(many.described.category_13_name).toBeUndefined();
  });

  it("has nothing to offer when nothing was spent or budgeted", () => {
    const quiet = facts({
      month: { totalSpending: cents(0), categories: [category("Dining", 0)] },
    });

    expect(quiet.categories).toEqual([]);
    expect(quiet.values.month_spent).toBeUndefined();
    expect(Object.keys(quiet.described).join(" ")).not.toContain("category");
  });

  it("leaves every month label out when the month could not be read", () => {
    const unread = facts({ month: undefined });

    expect(unread.categories).toEqual([]);
    expect(Object.keys(valuesOf(unread)).filter(isMonthToDate)).toEqual([]);
    // Everything else is still there.
    expect(unread.values.cash_total).toBe("$5,500.25");
    expect(unread.values.due_1_name).toBe("Rent");
    expect(unread.accounts).toHaveLength(4);
  });

  it("is not a monthly average", () => {
    for (const label of Object.keys(valuesOf(facts())).filter(isMonthToDate)) {
      expect(MONTHLY_LABELS.has(label as keyof typeof LABELS)).toBe(false);
    }
    expect(isMonthToDate("category_1_name")).toBe(false);
    expect(isMonthToDate("top_category_1_amount")).toBe(false);
    expect(isMonthToDate("due_1_amount")).toBe(false);
  });
});

describe("upcoming payments", () => {
  it("names the next three, soonest first, with written-out dates", () => {
    const four = facts({
      calendar: payday([
        due("Rent", "Thursday, October 15", -120_000),
        due("Netflix", "Saturday, October 17", -1_599),
        due("Electric", "Monday, October 19", -8_050),
        due("Gym", "Tuesday, October 20", -3_000),
      ]),
    });

    expect(four.values).toMatchObject({
      due_1_name: "Rent",
      due_1_amount: "$1,200.00",
      due_1_date: "Thursday, October 15",
      due_2_name: "Netflix",
      due_2_amount: "$15.99",
      due_2_date: "Saturday, October 17",
      due_3_name: "Electric",
      due_3_amount: "$80.50",
      due_3_date: "Monday, October 19",
      // The total and the count still cover all four.
      due_before_payday: "$1,326.49",
      due_count: "4 payments",
    });
    expect(Object.keys(four.values).join(" ")).not.toContain("due_4");
  });

  it("has none until a payday is confirmed", () => {
    const none = facts({
      calendar: { ...noPayday, upcoming: twoDue.upcoming },
    });

    expect(none.payday).toBe("none");
    expect(none.values.due_1_name).toBeUndefined();
  });
});

describe("accounts", () => {
  it("gives each account's name and balance, in the stored order", () => {
    const { accounts: listed, described } = facts();

    expect(listed).toEqual([
      { name: "Everyday", kind: "checking" },
      { name: "Rainy Day", kind: "savings" },
      { name: "Quicksilver", kind: "credit_card" },
      { name: "Corolla", kind: "loan" },
    ]);
    expect(described.account_1_name!.value).toBe("Everyday");
    expect(described.account_1_balance!.value).toBe("$1,500.25");
    expect(described.account_2_balance!.value).toBe("$4,000.00");
  });

  it("gives a card's or a loan's balance as what is owed, and says so", () => {
    const { described } = facts();

    expect(described.account_3_balance!.value).toBe("$320.10");
    expect(described.account_3_balance!.description).toContain("they owe");
    expect(described.account_4_balance!.value).toBe("$12,000.00");
    expect(described.account_4_balance!.description).toContain("they owe");
    expect(described.account_1_balance!.description).not.toContain("owe");
  });

  it("owes nothing on a card that is in credit", () => {
    const inCredit = facts({
      accounts: [
        { type: "credit_card", nickname: "Blue", balance: cents(2_500) },
      ],
    });

    expect(inCredit.described.account_1_balance!.value).toBe("$0.00");
  });

  it("stops at six", () => {
    const many = facts({
      accounts: Array.from({ length: 8 }, (_, index) => ({
        type: "checking" as const,
        nickname: `Pot ${"abcdefgh"[index]}`,
        balance: cents(100),
      })),
    });

    expect(many.accounts).toHaveLength(6);
    expect(many.described.account_6_name!.value).toBe("Pot f");
    expect(many.described.account_7_name).toBeUndefined();
  });
});

describe("the prompt, for these questions", () => {
  const input = buildUserInput("how much on food?", facts());

  it("describes every label it offers, and offers every label it has", () => {
    const all = facts();
    const offered = new Set(Object.keys(valuesOf(all)));

    for (const label of offered) {
      const description =
        all.described[label]?.description ??
        LABELS[label as keyof typeof LABELS];
      expect(input).toContain(`{${label}}: ${description}`);
    }
    // Nothing is mentioned that could not be filled.
    for (const label of labelsIn(input)) expect(offered).toContain(label);
  });

  it("names the category in each category label's description", () => {
    const { described } = facts();

    expect(described.category_2_spent!.description).toBe(
      "exactly what they spent on Dining so far this month",
    );
    for (const part of ["name", "spent", "budget", "over"]) {
      expect(described[`category_2_${part}`]!.description).toContain("Dining");
    }
    expect(described.category_1_left!.description).toContain("Groceries");
  });

  it("holds no figure, and no account nickname, outside a label", () => {
    const all = facts();
    const outsideLabels = withoutLabels(`${SYSTEM_INSTRUCTION}\n${input}`);

    for (const [label, value] of Object.entries(valuesOf(all))) {
      // A category's name is what its description is for.
      if (/^category_[0-9]+_name$/.test(label)) continue;
      expect(outsideLabels).not.toContain(value);
    }
    for (const { nickname } of accounts) {
      expect(outsideLabels).not.toContain(nickname);
    }
    expect(hasOwnDigits(input)).toBe(false);
    expect(hasOwnDigits(SYSTEM_INSTRUCTION)).toBe(false);
  });

  it("says what kind of account each is, without its name", () => {
    expect(input).toContain(
      "{account_2_name}: the name they gave a savings account of theirs",
    );
    expect(input).toContain(
      "{account_3_balance}: a credit card: exactly what they owe on {account_3_name} right now",
    );
  });

  it("sends no category name that holds a digit or a brace", () => {
    const odd = facts({
      month: {
        totalSpending: cents(5_000),
        categories: [category("Kids 529", 3_000), category("{cash}", 2_000)],
      },
    });
    const oddInput = buildUserInput("how much on kids?", odd);

    expect(hasOwnDigits(oddInput)).toBe(false);
    expect(oddInput).not.toContain("{cash}");
    expect(oddInput).toContain(
      "{category_1_spent}: exactly what they spent on the category {category_1_name} so far this month",
    );
    // The name is still the label's value.
    expect(odd.described.category_1_name!.value).toBe("Kids 529");
  });

  it("tells the model that only this month is known", () => {
    expect(SYSTEM_INSTRUCTION).toContain("only this month so far is available");
    expect(SYSTEM_INSTRUCTION).toContain("never add figures together");
  });
});

describe("completeDraft, for this month's figures", () => {
  const all = facts();

  it("rejects a month-to-date figure that is not called this month", () => {
    for (const draft of [
      "You spent {category_1_spent} on {category_1_name}.",
      "Your {category_1_name} budget is {category_1_budget}.",
      "You have {category_1_left} left for {category_1_name}.",
      "You are {category_2_over} over on {category_2_name}.",
      "You spent {month_spent} in all.",
      // "a month" would make it read as an average.
      "You spend {category_1_spent} a month on {category_1_name}.",
    ]) {
      expect(completeDraft(draft, all)).toEqual({
        ok: false,
        reason: "month_to_date_not_called_this_month",
      });
    }
  });

  it("accepts one that is, in any case", () => {
    expect(
      completeDraft(
        "You've spent {category_2_spent} on {category_2_name} so far this month.",
        all,
      ),
    ).toEqual({
      ok: true,
      text: "You've spent $212.40 on Dining so far this month.",
    });
    expect(
      completeDraft("This month you have spent {month_spent}.", all).ok,
    ).toBe(true);
  });

  it("asks nothing more of names, payments and accounts", () => {
    for (const draft of [
      "Your biggest category is {category_1_name}.",
      "{due_1_name} ({due_1_amount}) is due {due_1_date}.",
      "{account_2_name} has {account_2_balance}.",
    ]) {
      expect(completeDraft(draft, all).ok).toBe(true);
    }
  });

  it("keeps the earlier checks, in their order", () => {
    expect(completeDraft("Spent {category_1_spent}, up 5%.", all)).toEqual({
      ok: false,
      reason: "digits",
    });
    expect(
      completeDraft("{category_9_spent} went on it this month.", all),
    ).toEqual({ ok: false, reason: "unknown_label" });
    expect(completeDraft("You have {cash_total}.", all).ok).toBe(true);
  });
});

describe("the code-built reply to a question", () => {
  it("is the general summary, exactly as before, for anything else", () => {
    const all = facts();

    for (const text of ["how am I doing?", "what can I spend?", "status"]) {
      expect(fallbackDraft(all, text)).toBe(fallbackDraft(all));
    }
  });

  it("declines a text that is not about money, without any figure (HO-115)", () => {
    const all = facts();
    for (const text of ["what's the weather?", "tell me a joke", "who won"]) {
      expect(fallbackDraft(all, text)).toBe(CHAT_REPLIES.offTopic);
    }
    // Even with no accounts yet, an off-topic text is declined.
    expect(fallbackDraft(facts({ accounts: [] }), "tell me a joke")).toBe(
      CHAT_REPLIES.offTopic,
    );
  });

  it("says what was spent on a category, and what is left of its budget", () => {
    expect(reply("whats left in my grocries budget")).toBe(
      "You've spent $388.15 on Groceries so far this month. You have $111.85 left of your $500.00 Groceries budget this month.",
    );
  });

  it("says how far over a budget, plainly", () => {
    expect(reply("how much did I spend on dining?")).toBe(
      "You've spent $212.40 on Dining so far this month. That is $12.40 over your $200.00 Dining budget this month.",
    );
  });

  it("says when a budget is used exactly", () => {
    expect(reply("health?")).toBe(
      "You've spent $20.00 on Health so far this month. That is all of your $20.00 Health budget this month.",
    );
  });

  it("gives spending alone without a budget, and says there is none if asked", () => {
    expect(reply("how much on transport")).toBe(
      "You've spent $90.00 on Transport so far this month.",
    );
    expect(reply("what's my transport budget")).toBe(
      "You've spent $90.00 on Transport so far this month. There is no Transport budget set for this month.",
    );
  });

  it("answers food with dining and groceries together", () => {
    const noBudgets = facts({
      month: {
        totalSpending: cents(60_055),
        categories: [category("Dining", 21_240), category("Groceries", 38_815)],
      },
    });

    expect(reply("how much did I spend on food?", noBudgets)).toBe(
      "You've spent $388.15 on Groceries and $212.40 on Dining so far this month.",
    );
  });

  it("says only this month is known when asked about another time", () => {
    expect(reply("how much on transport last month?")).toBe(
      "I only have this month so far. You've spent $90.00 on Transport so far this month.",
    );
  });

  it("lists the payments due before payday, soonest first", () => {
    expect(reply("what bills are coming up?")).toBe(
      "Rent ($1,200.00) is due Thursday, October 15, and Netflix ($15.99) on Saturday, October 17. $1,215.99 is due in all before your next payday.",
    );
  });

  it("names one payment, and three of more", () => {
    const one = facts({
      calendar: payday([due("Rent", "Thursday, October 15", -120_000)]),
    });
    expect(reply("anything due?", one)).toBe(
      "Rent ($1,200.00) is due Thursday, October 15. Nothing else is due before your next payday.",
    );

    const four = facts({
      calendar: payday([
        due("Rent", "Thursday, October 15", -120_000),
        due("Netflix", "Saturday, October 17", -1_599),
        due("Electric", "Monday, October 19", -8_050),
        due("Gym", "Tuesday, October 20", -3_000),
      ]),
    });
    expect(reply("upcoming bills", four)).toBe(
      "Rent ($1,200.00) is due Thursday, October 15, Netflix ($15.99) on Saturday, October 17, and Electric ($80.50) on Monday, October 19. $1,326.49 is due in all before your next payday.",
    );
  });

  it("says nothing is due when nothing is", () => {
    expect(reply("what bills are due?", facts({ calendar: payday([]) }))).toBe(
      "Nothing is due before your next payday on Friday, October 23.",
    );
  });

  it("points to confirming a payday when none is confirmed", () => {
    expect(
      reply(
        "what bills are coming up?",
        facts({ calendar: { ...noPayday, suggestions: 2 } }),
      ),
    ).toBe(
      "Confirm your payday on the website's Recurring payments page and I can tell you what you can spend a day. It has 2 recurring payments to review.",
    );
  });

  it("gives an account's balance, by kind or by name", () => {
    expect(reply("what's in my savings?")).toBe(
      "Your savings account, Rainy Day, has $4,000.00.",
    );
    expect(reply("how much is in everyday")).toBe(
      "Your checking account, Everyday, has $1,500.25.",
    );
  });

  it("gives a card or a loan as what is owed", () => {
    expect(reply("what's on my credit card?")).toBe(
      "You owe $320.10 on your credit card, Quicksilver.",
    );
    expect(reply("corolla loan balance")).toBe(
      "You owe $12,000.00 on your loan, Corolla.",
    );
  });

  it("still says there are no accounts, whatever is asked", () => {
    const none = buildFacts({
      accounts: [],
      calendar: noPayday,
      measures: null,
      categoryNames: {},
    });

    expect(fallbackDraft(none, "how much on food?")).toBe(fallbackDraft(none));
  });
});

describe("completeDraft: what a model may not write (HO-115)", () => {
  it.each([
    ["You have ${cash_total} in checking.", "currency_sign"],
    ["You have {cash_total}$ in checking.", "currency_sign"],
    ["You spent about three hundred dollars this month.", "number_words"],
    ["That is twice what you spent this month.", "number_words"],
    ["About half of {month_spent} went to food this month.", "number_words"],
    ["Got it, I logged that for you.", "claims_action"],
    ["I've saved it to your account.", "claims_action"],
    ["Done, I removed it.", "claims_action"],
  ])("%j is rejected: %s", (draft, reason) => {
    expect(completeDraft(draft, facts())).toEqual({ ok: false, reason });
  });

  it("still accepts ordinary sentences with those words in them", () => {
    for (const draft of [
      "You have {cash_total} in checking and savings.",
      "You owe {owed_total}; the next one to pay is on the website.",
      "No one can see this but you.",
    ]) {
      expect(completeDraft(draft, facts()).ok).toBe(true);
    }
  });
});
