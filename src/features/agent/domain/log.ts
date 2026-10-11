import { type Cents, cents, parseDollars } from "@/lib/money";

// Reads a text as "log this spending" (F-27, ADR-064). Code decides, and
// when it is not sure it asks: nothing here guesses an amount (ADR-035).
// Pure: no I/O, no model.

/** The most one text may log. Larger amounts are added on the website. */
export const MAX_LOG_CENTS = cents(999_999);

/** How long a description may be. */
export const MAX_DESCRIPTION_LENGTH = 80;

/** Longer than this is a paragraph, not a log. */
const MAX_TEXT_LENGTH = 300;

/** A log is a few words, not a sentence about something else. */
const MAX_SHORT_FORM_WORDS = 6;

export type LogDay = "today" | "yesterday";

/** Why a text that looks like spending cannot be saved as it stands. */
export type Unclear =
  | "no_amount"
  | "amount_in_words"
  | "no_description"
  | "several_amounts"
  | "bad_amount"
  | "abbreviated"
  | "too_large"
  | "not_usd"
  | "income"
  | "other_day";

export type LogCommand =
  | { type: "none" }
  | { type: "undo" }
  | { type: "unclear"; reason: Unclear }
  | {
      type: "log";
      /** Positive: what was spent, read from the person's own digits. */
      amount: Cents;
      /** Their own words, with the amount and filler taken out. */
      description: string;
      /**
       * The same words before filler is trimmed off the ends: "on card",
       * where `description` is "card". The account step reads this, since
       * "on" and "from" are how an account is named.
       */
      phrase: string;
      day: LogDay;
    };

const NONE: LogCommand = { type: "none" };
const unclear = (reason: Unclear): LogCommand => ({ type: "unclear", reason });

/**
 * How many single-character edits (insert, delete, replace, or swapping two
 * neighbours) turn `a` into `b`. Used to forgive one typo.
 */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

// Words that say "I spent money". One typo is forgiven in the long ones
// ("spnt", "bougt"); the short ones have too many near neighbours ("said",
// "pain"), so their common misspellings are listed.
const SPENT_WORDS = ["spent", "bought", "purchased", "charged"];
const SPENT_EXACT = new Set(["paid", "payed", "piad", "pd"]);

function isSpentWord(word: string): boolean {
  if (SPENT_EXACT.has(word)) return true;
  return (
    word.length >= 4 &&
    SPENT_WORDS.some((target) => editDistance(word, target) <= 1)
  );
}

// These mean spending only next to an amount ("got 5 tacos", "lunch cost 12").
const WEAK_SPEND_WORDS = new Set(["got", "cost", "costs"]);

// Asking for it to be saved: "log 12 lunch", "can you add 12 for lunch".
const REQUEST =
  /^(?:(?:can|could|would|will) (?:you|u) )?(?:please |pls )?(?:log|add|record|track|put)\b/;
const REQUEST_WORDS = new Set(["log", "add", "record", "track", "put"]);

// Money coming in is not spending; it is added on the website.
const INCOME_WORDS = new Set([
  "paycheck",
  "paycheque",
  "payday",
  "salary",
  "wages",
  "received",
  "recieved",
  "earned",
  "refund",
  "refunded",
  "deposit",
  "deposited",
  "income",
  "reimbursed",
]);

// A text that opens with one of these is a question for the answer path.
const QUESTION_WORDS = new Set([
  "how",
  "what",
  "whats",
  "what's",
  "when",
  "where",
  "why",
  "who",
  "which",
  "can",
  "could",
  "do",
  "does",
  "did",
  "is",
  "are",
  "am",
  "should",
  "will",
  "would",
  "show",
  "tell",
  "give",
  "list",
]);

// A habit is a statement about usual spending, not one purchase.
const HABIT =
  /\b(?:a|per|every|each) (?:day|week|month|year)\b|\b(?:usually|always|typically|weekly|monthly|yearly|average)\b/;

// A number followed by one of these counts things; it is not money.
const COUNT_UNITS = new Set([
  "min",
  "mins",
  "minute",
  "minutes",
  "hr",
  "hrs",
  "hour",
  "hours",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "time",
  "times",
  "people",
  "ppl",
  "am",
  "pm",
  "miles",
  "mi",
  "km",
  "lbs",
  "lb",
  "oz",
  "percent",
]);

// A plain number after one of these is a time or a place, not a price.
const TIME_WORDS = new Set([
  "at",
  "by",
  "around",
  "until",
  "till",
  "before",
  "after",
  "within",
]);

const DOLLAR_UNITS = new Set(["dollar", "dollars", "buck", "bucks", "usd"]);

const FOREIGN_UNITS = new Set([
  "eur",
  "euro",
  "euros",
  "gbp",
  "pound",
  "pounds",
  "quid",
  "rs",
  "inr",
  "pkr",
  "rupee",
  "rupees",
  "yen",
  "cad",
  "aud",
  "peso",
  "pesos",
]);
const FOREIGN_SIGN = /[€£¥₹₨]/;

const NUMBER_WORDS = new Set([
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "grand",
]);

const WEEKDAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

// Words that say nothing about what was bought. They are dropped from the
// ends of a description, and a text made only of them is not a log.
const FILLER = new Set([
  "i",
  "i've",
  "ive",
  "we",
  "just",
  "also",
  "please",
  "pls",
  "hey",
  "hi",
  "hello",
  "ok",
  "okay",
  "can",
  "could",
  "would",
  "will",
  "you",
  "u",
  "me",
  "my",
  "a",
  "an",
  "the",
  "some",
  "of",
  "on",
  "for",
  "at",
  "in",
  "to",
  "it",
  "that",
  "this",
  "was",
  "is",
  "and",
  "today",
  "tonight",
  "now",
  "earlier",
  "thanks",
  "thank",
  "yes",
  "no",
  "lol",
  "see",
  "about",
  "around",
  "like",
  "by",
  "until",
  "till",
  "dollar",
  "dollars",
  "buck",
  "bucks",
  "usd",
]);

/** A token's meaning for the parser. */
type Token =
  | { kind: "amount"; value: Cents | null }
  | { kind: "abbreviated" }
  | { kind: "foreign" }
  | { kind: "word"; text: string; original: string };

const MONEY = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\$?$/;
const ABBREVIATED = /^\$?\d+(?:\.\d+)?[km]$/;
const DATE_LIKE = /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/;
const YESTERDAY = /\b(?:yesterday|yday|last night)\b/;
const DAY_PHRASE = new RegExp(YESTERDAY.source, "gi");

/** Punctuation that surrounds a token without being part of it. */
const strip = (token: string) =>
  token.replace(/^[("'[]+/, "").replace(/[)"'\].,!?;:]+$/, "");

function tokenize(text: string): Token[] {
  const parts = text
    .split(" ")
    .map(strip)
    .filter((part) => part !== "");
  const tokens: Token[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const original = parts[i]!;
    let core = original.toLowerCase();
    const before = (parts[i - 1] ?? "").toLowerCase();

    // "$ 12" is one amount.
    if (core === "$" && /^\d/.test(parts[i + 1] ?? "")) {
      i += 1;
      core = `$${parts[i]!.toLowerCase()}`;
    }
    const after = (parts[i + 1] ?? "").toLowerCase();

    if (FOREIGN_SIGN.test(core) && /\d/.test(core)) {
      tokens.push({ kind: "foreign" });
      continue;
    }
    // "12usd", "12bucks", "12eur": the unit is stuck to the number.
    const glued = /^(\$?[\d.,]+)([a-z]+)$/.exec(core);
    if (glued && FOREIGN_UNITS.has(glued[2]!)) {
      tokens.push({ kind: "foreign" });
      continue;
    }
    if (glued && DOLLAR_UNITS.has(glued[2]!)) core = glued[1]!;
    if (ABBREVIATED.test(core)) {
      tokens.push({ kind: "abbreviated" });
      continue;
    }

    const money = MONEY.exec(core);
    if (money) {
      // Eight digits or more is a phone number or a code, not a price.
      const tooLong = money[1]!.replace(/,/g, "").length > 7;
      // "at 5", "by 10": a time, unless it is written as money.
      const marked =
        core.includes("$") || money[2] !== undefined || DOLLAR_UNITS.has(after);
      const isTime = TIME_WORDS.has(before) && !marked;
      if (!tooLong && !isTime && !COUNT_UNITS.has(after)) {
        if (FOREIGN_UNITS.has(after)) {
          tokens.push({ kind: "foreign" });
          i += 1;
          continue;
        }
        if (DOLLAR_UNITS.has(after)) i += 1;
        tokens.push({
          kind: "amount",
          // More than two decimals is not dollars and cents.
          value:
            (money[2]?.length ?? 0) > ".00".length
              ? null
              : parseDollars(core.replace(/\$/g, "")),
        });
        continue;
      }
    }
    tokens.push({ kind: "word", text: core, original });
  }
  return tokens;
}

const UNDO_PHRASES = new Set([
  "undo",
  "undo that",
  "undo it",
  "undo last",
  "undo the last one",
  "undo please",
  "undo pls",
  "oops",
  "oops undo",
  "remove that",
  "remove it",
  "delete that",
  "delete it",
  "take that back",
]);

function isUndo(lower: string): boolean {
  const phrase = lower.replace(/[.!?]+$/, "").trim();
  if (UNDO_PHRASES.has(phrase)) return true;
  // One word, one typo: "udno", "undoo", "und".
  return (
    !phrase.includes(" ") &&
    phrase.length >= 3 &&
    phrase.length <= 5 &&
    editDistance(phrase, "undo") <= 1
  );
}

/** Words with filler taken off both ends, capped: what the thing is called. */
export function trimFiller(text: string): string {
  const kept = text.split(" ").filter((word) => word !== "");
  const isFiller = (word: string) => FILLER.has(word.toLowerCase());
  while (kept.length > 0 && isFiller(kept[0]!)) kept.shift();
  while (kept.length > 0 && isFiller(kept[kept.length - 1]!)) kept.pop();
  return kept.join(" ").slice(0, MAX_DESCRIPTION_LENGTH).trim();
}

/** Their words in order, without the day they named. */
function phraseOf(words: readonly { original: string }[]): string {
  return words
    .map((word) => word.original)
    .join(" ")
    .replace(DAY_PHRASE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What a text asks for, as far as logging goes. `none` means it is not
 * about logging at all and belongs to the normal answer path.
 */
export function parseLog(input: string): LogCommand {
  const text = input
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (text === "" || text.length > MAX_TEXT_LENGTH) return NONE;
  const lower = text.toLowerCase();

  if (isUndo(lower)) return { type: "undo" };

  const tokens = tokenize(text);
  const words = tokens.filter((token) => token.kind === "word");
  const amounts = tokens.filter((token) => token.kind === "amount");
  const wordTexts = words.map((word) => word.text);

  const isRequest = REQUEST.test(lower);
  const isQuestion =
    lower.endsWith("?") || QUESTION_WORDS.has(wordTexts[0] ?? "");
  if (isQuestion && !isRequest) return NONE;
  if (HABIT.test(lower)) return NONE;

  const numbers = tokens.length - words.length;
  const spent = wordTexts.some(isSpentWord);
  const weak = wordTexts.some((word) => WEAK_SPEND_WORDS.has(word));
  const income =
    wordTexts.some((word) => INCOME_WORDS.has(word)) ||
    /\bgot paid\b/.test(lower);

  // What they called it: their words without the verbs and the request.
  const phrase = phraseOf(
    words.filter(
      (word) =>
        !isSpentWord(word.text) &&
        !WEAK_SPEND_WORDS.has(word.text) &&
        !(isRequest && REQUEST_WORDS.has(word.text)),
    ),
  );
  const description = trimFiller(phrase);
  const named = /\p{L}/u.test(description);

  // The short form: an amount first or last, with a few words that name it.
  // Filler and "yesterday" do not count as the edge: "lunch 12 yesterday".
  const lastNight = /\blast night\b/.test(lower);
  const edge = tokens.filter(
    (token) =>
      token.kind !== "word" ||
      !(
        FILLER.has(token.text) ||
        YESTERDAY.test(token.text) ||
        (lastNight && (token.text === "last" || token.text === "night"))
      ),
  );
  const amountAtEdge =
    edge.length > 0 &&
    (edge[0]!.kind !== "word" || edge[edge.length - 1]!.kind !== "word");
  const shortForm =
    amountAtEdge && named && words.length <= MAX_SHORT_FORM_WORDS;
  const bare = numbers === 1 && words.length === 0;

  const aboutSpending =
    numbers > 0
      ? spent || weak || isRequest || income || shortForm || bare
      : spent || isRequest;
  if (!aboutSpending) {
    // "twelve bucks lunch": an amount in words, said as money.
    const inWords =
      wordTexts.some((word) => NUMBER_WORDS.has(word)) &&
      wordTexts.some((word) => DOLLAR_UNITS.has(word));
    return inWords ? unclear("amount_in_words") : NONE;
  }

  if (income) return unclear("income");
  if (tokens.some((token) => token.kind === "foreign")) {
    return unclear("not_usd");
  }
  if (numbers === 0) {
    return unclear(
      wordTexts.some((word) => NUMBER_WORDS.has(word))
        ? "amount_in_words"
        : "no_amount",
    );
  }
  if (numbers > 1) return unclear("several_amounts");
  if (tokens.some((token) => token.kind === "abbreviated")) {
    return unclear("abbreviated");
  }

  const amount = amounts[0]!.value;
  if (amount === null) return unclear("bad_amount");
  if (amount > MAX_LOG_CENTS) return unclear("too_large");

  // Only today or yesterday can be logged by text.
  const otherDay =
    wordTexts.some(
      (word) =>
        WEEKDAYS.has(word) || word === "tomorrow" || DATE_LIKE.test(word),
    ) ||
    /\b(?:last|next|this past) (?:week|month|year|weekend)\b/.test(lower) ||
    /\bago\b/.test(lower);
  if (otherDay) return unclear("other_day");

  if (!named) return unclear("no_description");

  const day: LogDay = YESTERDAY.test(lower) ? "yesterday" : "today";
  return { type: "log", amount, description, phrase, day };
}
