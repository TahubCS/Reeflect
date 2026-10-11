import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import { type Facts, buildFacts } from "./summary";
import { type Topic, topicOf } from "./topic";

// F-28: which code-built reply a text gets. Label numbers follow the order
// of spending: 1 Groceries, 2 Dining, 3 Loans, 4 Personal care.

const spent = (name: string, amount: number) => ({
  name,
  spent: cents(amount),
  allocation: null,
  remaining: null,
});

const facts: Facts = buildFacts({
  accounts: [
    { type: "checking", nickname: "Everyday", balance: cents(100_000) },
    { type: "savings", nickname: "Rainy Day", balance: cents(400_000) },
    { type: "credit_card", nickname: "Quicksilver", balance: cents(-5_000) },
    { type: "savings", nickname: "Holiday", balance: cents(20_000) },
    { type: "loan", nickname: "Corolla", balance: cents(-900_000) },
  ],
  calendar: {
    payday: null,
    dueTotal: cents(0),
    dueCount: 0,
    upcoming: [],
    freeToSpend: cents(0),
    perDay: cents(0),
    suggestions: 0,
  },
  month: {
    totalSpending: cents(100_000),
    categories: [
      spent("Groceries", 40_000),
      spent("Dining", 30_000),
      spent("Loans", 20_000),
      spent("Personal care", 10_000),
    ],
  },
  measures: null,
  categoryNames: {},
});

const categories = (
  picked: number[],
  changes: Partial<Extract<Topic, { type: "categories" }>> = {},
): Topic => ({
  type: "categories",
  picked,
  budgetAsked: false,
  otherPeriod: false,
  ...changes,
});

describe("topicOf", () => {
  it.each([
    ["how much did I spend on groceries?", [1]],
    ["Dining", [2]],
    ["GROCERIES and dining", [1, 2]],
    ["how much on personal care this month", [4]],
    ["what went on loans", [3]],
  ])("finds a category named as whole words: %s", (text, picked) => {
    expect(topicOf(text, facts)).toEqual(categories(picked));
  });

  it.each([
    ["how much on grocries", [1]],
    ["groseries?", [1]],
    ["dinning out", [2]],
    ["what about dinig", [2]],
  ])("forgives one typo in a one-word name: %s", (text, picked) => {
    expect(topicOf(text, facts)).toEqual(categories(picked));
  });

  it.each([
    // Two edits away.
    "how much on grocrys",
    // Part of a two-word name, and a typo in one, are not enough.
    "personal",
    "personal cars",
    // Short words are never typos of anything.
    "do I",
  ])("does not guess a category from: %s", (text) => {
    expect(topicOf(text, facts)).toEqual({ type: "summary" });
  });

  it("reads food as dining and groceries, when they exist", () => {
    expect(topicOf("how much did I spend on food?", facts)).toEqual(
      categories([1, 2]),
    );

    const noDining = buildFacts({
      accounts: [
        { type: "checking", nickname: "Everyday", balance: cents(1_000) },
      ],
      calendar: {
        payday: null,
        dueTotal: cents(0),
        dueCount: 0,
        upcoming: [],
        freeToSpend: cents(0),
        perDay: cents(0),
        suggestions: 0,
      },
      month: {
        totalSpending: cents(500),
        categories: [spent("Transport", 500)],
      },
      measures: null,
      categoryNames: {},
    });
    expect(topicOf("how much on food?", noDining)).toEqual({ type: "summary" });
  });

  it("notes when a budget is asked about", () => {
    expect(topicOf("whats left in my grocries budget", facts)).toEqual(
      categories([1], { budgetAsked: true }),
    );
  });

  it.each([
    "how much on dining last month",
    "dining last week?",
    "groceries yesterday",
    "what did I spend on groceries last year",
    "dining in september",
    "groceries two weeks ago",
  ])("notes another period: %s", (text) => {
    expect(topicOf(text, facts)).toMatchObject({
      type: "categories",
      otherPeriod: true,
    });
  });

  it("does not take this month, or the verb may, for another period", () => {
    expect(topicOf("dining this month", facts)).toEqual(categories([2]));
    expect(topicOf("may I ask what went on dining", facts)).toEqual(
      categories([2]),
    );
  });

  it.each([
    "what bills are coming up?",
    "any bill soon",
    "whats due",
    "upcoming payments",
    "what do I owe",
    "anything coming up?",
  ])("reads a question about payments: %s", (text) => {
    expect(topicOf(text, facts)).toEqual({ type: "payments" });
  });

  it.each([
    ["what's in my savings?", [2, 4]],
    ["checking balance", [1]],
    ["how much is on my credit card", [3]],
    ["card?", [3]],
    ["my loan", [5]],
    ["how much is in rainy day", [2]],
    ["quicksilver", [3]],
    ["holiday and everyday", [1, 4]],
  ])("finds accounts by kind or by name: %s", (text, picked) => {
    expect(topicOf(text, facts)).toEqual({ type: "accounts", picked });
  });

  it("keeps a category ahead of bills, and bills ahead of accounts", () => {
    expect(topicOf("what bills went on dining", facts)).toEqual(
      categories([2]),
    );
    expect(topicOf("what do I owe on my card", facts)).toEqual({
      type: "payments",
    });
  });

  it("does not read loan as a typo of the Loans category", () => {
    expect(topicOf("what is left on my loan", facts)).toEqual({
      type: "accounts",
      picked: [5],
    });
  });

  it.each(["how am I doing?", "hello", "what can I spend?", "", "?!"])(
    "leaves everything else to the general summary: %s",
    (text) => {
      expect(topicOf(text, facts)).toEqual({ type: "summary" });
    },
  );

  it("names at most three categories", () => {
    expect(
      topicOf("groceries, dining, loans and personal care", facts),
    ).toEqual(categories([1, 2, 3]));
  });
});
