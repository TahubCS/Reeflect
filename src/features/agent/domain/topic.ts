import type { AccountKind } from "@/features/insights";
import { editDistance } from "./log";
import type { Facts } from "./summary";

// Which code-built reply a text gets (F-28). Only the reply code builds by
// itself asks this: with a model, the model reads the question. It works
// from words alone and never guesses a figure, so a wrong reading costs a
// plain answer to the wrong question, never a wrong number.

/** Numbers are label numbers: 1 is `category_1_…` or `account_1_…`. */
export type Topic =
  | {
      type: "categories";
      picked: number[];
      /** They said "budget", so a category without one is said to have none. */
      budgetAsked: boolean;
      /** They asked about a time other than this month. */
      otherPeriod: boolean;
    }
  | { type: "payments" }
  | { type: "accounts"; picked: number[] }
  | { type: "summary" };

/** A reply is a text message: no more categories than this in one. */
const MAX_CATEGORIES = 3;

/** One word that stands for categories by their usual names. */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  food: ["dining", "groceries"],
};

const PAYMENT_WORDS = new Set(["bill", "bills", "due", "upcoming", "owe"]);

const ACCOUNT_WORDS: Readonly<Record<string, AccountKind>> = {
  savings: "savings",
  checking: "checking",
  // "credit card" too: its second word is enough.
  card: "credit_card",
  cards: "credit_card",
  loan: "loan",
  loans: "loan",
};

// "may" is left out: it is far more often the verb than the month.
const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const PAST_WORDS = new Set(["yesterday", "ago", ...MONTH_NAMES]);
const PAST_PHRASES = ["last month", "last week", "last year"];

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");

/** Whether `name` appears in the text as whole words, in order. */
const says = (phrase: string, name: string[]) =>
  name.length > 0 && phrase.includes(` ${name.join(" ")} `);

/**
 * One typo is forgiven in a one-word category name ("grocries"). A word
 * that already means bills or an account is not a typo of anything, so
 * "loan" asks about the loan, not the Loans category.
 */
function misspells(word: string, name: string): boolean {
  return (
    word.length >= 4 &&
    !PAYMENT_WORDS.has(word) &&
    !Object.hasOwn(ACCOUNT_WORDS, word) &&
    editDistance(word, name) <= 1
  );
}

function categoriesIn(words: string[], phrase: string, facts: Facts): number[] {
  const synonyms = words.flatMap((word) =>
    Object.hasOwn(SYNONYMS, word) ? SYNONYMS[word]! : [],
  );
  return facts.categories
    .flatMap((category, index) => {
      const name = wordsOf(category.name);
      const meant =
        says(phrase, name) ||
        synonyms.includes(name.join(" ")) ||
        (name.length === 1 && words.some((word) => misspells(word, name[0]!)));
      return meant ? [index + 1] : [];
    })
    .slice(0, MAX_CATEGORIES);
}

function accountsIn(words: string[], phrase: string, facts: Facts): number[] {
  const kinds = new Set(
    words.flatMap((word) =>
      Object.hasOwn(ACCOUNT_WORDS, word) ? [ACCOUNT_WORDS[word]!] : [],
    ),
  );
  return facts.accounts.flatMap((account, index) =>
    kinds.has(account.kind) || says(phrase, wordsOf(account.name))
      ? [index + 1]
      : [],
  );
}

/** What the text is asking about, as far as its words say. */
export function topicOf(text: string, facts: Facts): Topic {
  const words = wordsOf(text);
  const phrase = ` ${words.join(" ")} `;

  const categories = categoriesIn(words, phrase, facts);
  if (categories.length > 0) {
    return {
      type: "categories",
      picked: categories,
      budgetAsked: words.includes("budget") || words.includes("budgets"),
      otherPeriod:
        words.some((word) => PAST_WORDS.has(word)) ||
        PAST_PHRASES.some((past) => phrase.includes(` ${past} `)),
    };
  }
  if (
    words.some((word) => PAYMENT_WORDS.has(word)) ||
    phrase.includes(" coming up ")
  ) {
    return { type: "payments" };
  }
  const accounts = accountsIn(words, phrase, facts);
  if (accounts.length > 0) return { type: "accounts", picked: accounts };
  return { type: "summary" };
}
