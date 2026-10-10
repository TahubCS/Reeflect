import { describe, expect, it } from "vitest";
import { readText } from "./read-text";

describe("readText: spending", () => {
  it("reads the amount, name and category from a plain message", () => {
    expect(readText("spent 12 on lunch")).toEqual({
      type: "spend",
      amount: 1200,
      name: "Lunch",
      category: "Eating out",
    });
  });

  it("accepts a dollar sign, cents, other verbs and trailing punctuation", () => {
    expect(readText("I paid $12.50 for coffee.")).toEqual({
      type: "spend",
      amount: 1250,
      name: "Coffee",
      category: "Coffee",
    });
  });

  it("accepts thousands separators and the word bucks", () => {
    expect(readText("bought 1,204.99 bucks at the shoe shop")).toMatchObject({
      amount: 120499,
      category: "Shopping",
    });
  });

  it.each([
    ["spent 40 at the supermarket", "Groceries"],
    ["spent 9 on bus fare", "Transport"],
    ["spent 15 on a movie", "Fun"],
    ["spent 15 on a haircut", "Other"],
  ])("files %j under %s", (message, category) => {
    expect(readText(message)).toMatchObject({ type: "spend", category });
  });

  it("uses the category as the name when nothing was named", () => {
    expect(readText("spent 20")).toEqual({
      type: "spend",
      amount: 2000,
      name: "Other",
      category: "Other",
    });
  });

  it("does not log a zero amount", () => {
    expect(readText("spent 0 on lunch")).toEqual({ type: "unknown" });
  });
});

describe("readText: income", () => {
  it("reads money coming in", () => {
    expect(readText("got 50 from mom")).toEqual({
      type: "income",
      amount: 5000,
      name: "Mom",
      category: "Pay",
    });
  });

  it("uses a default name when none was given", () => {
    expect(readText("I received $100")).toMatchObject({
      type: "income",
      amount: 10000,
      name: "Money in",
    });
  });
});

describe("readText: questions and everything else", () => {
  it.each(["how am I doing?", "What's my balance", "where do I stand"])(
    "treats %j as a status question",
    (message) => {
      expect(readText(message)).toEqual({ type: "status" });
    },
  );

  it.each(["hello", "", "lunch was great", "twelve dollars on lunch"])(
    "does not guess at %j",
    (message) => {
      expect(readText(message)).toEqual({ type: "unknown" });
    },
  );
});
