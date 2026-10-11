import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import { editDistance, parseLog } from "./log";
import {
  type LogAccount,
  chooseAccount,
  readAccountAnswer,
} from "./log-account";
import {
  LOG_REPLIES,
  UNCLEAR_REPLIES,
  loggedReply,
  undoneReply,
  whichAccountReply,
} from "./log-replies";

/** What a logged text must parse to; `phrase` is checked on its own. */
type Expected = { type: string; [key: string]: unknown };
const log = (
  amount: number,
  description: string,
  day: "today" | "yesterday" = "today",
): Expected => ({ type: "log", amount: cents(amount), description, day });
const unclear = (reason: string) => ({ type: "unclear", reason });
const NONE = { type: "none" };

describe("parseLog: what is logged", () => {
  it.each<[string, Expected]>([
    // The short form, either way round.
    ["12 lunch", log(1200, "lunch")],
    ["lunch 12", log(1200, "lunch")],
    ["$12.50 tacos with sam", log(1250, "tacos with sam")],
    ["coffee 4.5", log(450, "coffee")],
    ["Lunch 12", log(1200, "Lunch")],
    ["  12   lunch  ", log(1200, "lunch")],
    ["12 lunch.", log(1200, "lunch")],
    ["12 lunch!!", log(1200, "lunch")],
    // Every accepted way to write an amount.
    ["$12 lunch", log(1200, "lunch")],
    ["12$ lunch", log(1200, "lunch")],
    ["$ 12 lunch", log(1200, "lunch")],
    ["12.5 lunch", log(1250, "lunch")],
    ["12.50 lunch", log(1250, "lunch")],
    ["1,200 rent", log(120000, "rent")],
    ["12 dollars lunch", log(1200, "lunch")],
    ["12 bucks lunch", log(1200, "lunch")],
    ["12 usd lunch", log(1200, "lunch")],
    ["12usd lunch", log(1200, "lunch")],
    ["12bucks lunch", log(1200, "lunch")],
    ["lunch $12.", log(1200, "lunch")],
    ["9999.99 laptop", log(999999, "laptop")],
    // Sentences with a spending word.
    ["spent 12 on lunch", log(1200, "lunch")],
    ["I spent $12.50 on lunch today", log(1250, "lunch")],
    ["paid 40 for gas", log(4000, "gas")],
    ["i just bought a coffee for 5", log(500, "coffee")],
    [
      "bought groceries at trader joes 84.20",
      log(8420, "groceries at trader joes"),
    ],
    ["got 5 tacos", log(500, "tacos")],
    ["lunch cost 12", log(1200, "lunch")],
    ["charged 30 for parking", log(3000, "parking")],
    // Asking for it to be saved.
    ["log 12 lunch", log(1200, "lunch")],
    ["add 12 for lunch", log(1200, "lunch")],
    ["can you log 12 for lunch", log(1200, "lunch")],
    ["can u add 12 lunch?", log(1200, "lunch")],
    ["please record 8 for coffee", log(800, "coffee")],
    // Typos in the verb and in the thing.
    ["spnt 12 on luch", log(1200, "luch")],
    ["spemt 12 on lunch", log(1200, "lunch")],
    ["payed 30 for gas", log(3000, "gas")],
    ["bougt 5 gum", log(500, "gum")],
    ["bouhgt 5 gum", log(500, "gum")],
    ["12 grocries", log(1200, "grocries")],
    // Yesterday.
    ["spent $8.50 on coffee yesterday", log(850, "coffee", "yesterday")],
    ["yesterday 12 lunch", log(1200, "lunch", "yesterday")],
    ["lunch 12 yesterday", log(1200, "lunch", "yesterday")],
    ["20 pizza last night", log(2000, "pizza", "yesterday")],
    ["12 lunch today", log(1200, "lunch")],
    // Numbers that are part of a name stay in the description.
    ["7up 2", log(200, "7up")],
    ["7-eleven 12", log(1200, "7-eleven")],
    ["12 7-eleven snacks", log(1200, "7-eleven snacks")],
    // Nonsense words with a clear amount are still what they said.
    ["asdf 12 qwer", NONE],
    ["12 asdf qwer", log(1200, "asdf qwer")],
    // Smart quotes and odd spacing from a phone keyboard.
    ["12 joe’s pizza", log(1200, "joe's pizza")],
    ["12 lunch", log(1200, "lunch")],
  ])("%j", (text, expected) => {
    expect(parseLog(text)).toMatchObject(expected);
    expect(parseLog(text).type).toBe(expected.type);
  });

  it("keeps the account's name, and its lead-in word, for the account step", () => {
    expect(parseLog("40 gas on card")).toEqual({
      ...log(4000, "gas on card"),
      phrase: "gas on card",
    });
    expect(parseLog("12 lunch from Everyday")).toMatchObject({
      description: "lunch from Everyday",
    });
    // "on" is filler at the start of a description, but names the account.
    expect(parseLog("12 on card")).toMatchObject({
      description: "card",
      phrase: "on card",
    });
    expect(parseLog("spent 12 on lunch")).toMatchObject({
      description: "lunch",
      phrase: "on lunch",
    });
  });

  it("caps a long description", () => {
    const parsed = parseLog(`12 ${"very ".repeat(30)}long`);
    expect(parsed.type).toBe("none");

    const five = parseLog(`12 ${"x".repeat(120)}`);
    expect(five.type === "log" && five.description.length).toBe(80);
  });
});

describe("parseLog: what it asks about instead of saving", () => {
  it.each<[string, string]>([
    ["spent on lunch", "no_amount"],
    ["paid for gas", "no_amount"],
    ["log lunch", "no_amount"],
    ["twelve bucks lunch", "amount_in_words"],
    ["spent twelve on lunch", "amount_in_words"],
    ["12", "no_description"],
    ["$12.50", "no_description"],
    ["spent 12", "no_description"],
    ["spent 12 today", "no_description"],
    ["12 lunch and 5 coffee", "several_amounts"],
    ["2 coffees 9", "several_amounts"],
    ["spent 12 and 13 on lunch", "several_amounts"],
    ["12.345 lunch", "bad_amount"],
    ["0 lunch", "bad_amount"],
    ["0.00 lunch", "bad_amount"],
    ["2k rent", "abbreviated"],
    ["1.5k rent", "abbreviated"],
    ["2m house", "abbreviated"],
    ["120000 lunch", "too_large"],
    ["10000 rent", "too_large"],
    ["1234567", "too_large"],
    ["€12 lunch", "not_usd"],
    ["£12 lunch", "not_usd"],
    ["12 pounds lunch", "not_usd"],
    ["500 rs lunch", "not_usd"],
    ["12eur lunch", "not_usd"],
    ["got paid 500", "income"],
    ["refund 20", "income"],
    ["earned 80 babysitting", "income"],
    ["received 50 from mom", "income"],
    ["paycheck 1200", "income"],
    ["12 lunch last friday", "other_day"],
    ["12 lunch tomorrow", "other_day"],
    ["12 lunch on monday", "other_day"],
    ["spent 12 on lunch 10/3", "other_day"],
    ["12 lunch 2 days ago", "other_day"],
    ["12 lunch last week", "other_day"],
  ])("%j → %s", (text, reason) => {
    expect(parseLog(text)).toEqual(unclear(reason));
  });

  it("has a reply for every reason, and each says nothing was logged", () => {
    for (const reply of Object.values(UNCLEAR_REPLIES)) {
      expect(reply).toContain("Nothing was logged.");
      expect(reply.length).toBeLessThan(200);
    }
  });
});

describe("parseLog: what is not about logging at all", () => {
  it.each<[string]>([
    // Questions, even with numbers and spending words.
    ["how am I doing?"],
    ["how much did I spend in the last 30 days?"],
    ["how much did I spend on the 3 subscriptions"],
    ["what did I spend on lunch"],
    ["did I pay 40 for gas?"],
    ["can I afford 200 shoes"],
    ["how do I add spending?"],
    ["is 12 lunch a lot?"],
    ["12 lunch?"],
    // Habits are statements, not one purchase.
    ["I spend 30 a week on gas"],
    ["usually lunch is 12"],
    // Numbers that are not money.
    ["see you at 5"],
    ["meet downtown at 5"],
    ["ok 10 mins"],
    ["back in 2 hours"],
    ["5pm works"],
    ["3rd time lucky"],
    ["24/7"],
    ["10% off"],
    ["2x"],
    ["thanks 2 u"],
    ["call me at 9195551234"],
    ["12345678901"],
    ["room 12 key please now ok thanks a lot friend"],
    // Chat and gibberish.
    [""],
    ["   "],
    ["hi"],
    ["thanks"],
    ["asdfgh"],
    ["lol ok"],
    ["😀😀"],
    ["I got it thanks"],
    ["sounds good"],
    ["lunch"],
    ["balance"],
    // STOP belongs to other code. (LINK is taken before this parser runs:
    // see runAgentTurn's tests.)
    ["STOP"],
    // A wall of text is not a log.
    [`spent 12 on lunch ${"and then ".repeat(40)}`],
  ])("%j", (text) => {
    expect(parseLog(text)).toEqual(NONE);
  });
});

describe("parseLog: UNDO", () => {
  it.each<[string]>([
    ["undo"],
    ["UNDO"],
    ["Undo."],
    ["undo!"],
    ["undo that"],
    ["undo last"],
    ["oops"],
    ["remove that"],
    ["delete that"],
    ["udno"],
    ["undoo"],
    ["unod"],
    ["und"],
  ])("%j", (text) => {
    expect(parseLog(text)).toEqual({ type: "undo" });
  });

  it.each<[string]>([
    ["do"],
    ["and"],
    ["under"],
    ["undone"],
    ["undo 12 lunch"],
  ])("%j is not UNDO", (text) => {
    expect(parseLog(text).type).not.toBe("undo");
  });
});

describe("editDistance", () => {
  it("counts inserts, deletes, replacements and swaps", () => {
    expect(editDistance("spent", "spent")).toBe(0);
    expect(editDistance("spnt", "spent")).toBe(1);
    expect(editDistance("spemt", "spent")).toBe(1);
    expect(editDistance("sepnt", "spent")).toBe(1);
    expect(editDistance("spentt", "spent")).toBe(1);
    expect(editDistance("lunch", "spent")).toBeGreaterThan(1);
    expect(editDistance("", "undo")).toBe(4);
  });
});

const everyday: LogAccount = {
  id: "a1",
  nickname: "Everyday",
  type: "checking",
};
const rainy: LogAccount = { id: "a2", nickname: "Rainy Day", type: "savings" };
const card: LogAccount = {
  id: "a3",
  nickname: "Quicksilver",
  type: "credit_card",
};
const car: LogAccount = { id: "a4", nickname: "Car loan", type: "loan" };

describe("chooseAccount", () => {
  it("uses the only account that can hold spending", () => {
    expect(chooseAccount("lunch", [everyday])).toEqual({
      ok: true,
      account: everyday,
      rest: "lunch",
    });
    expect(chooseAccount("lunch", [everyday, car])).toMatchObject({
      account: everyday,
    });
  });

  it("asks when there are several and none is named", () => {
    expect(chooseAccount("lunch", [everyday, card])).toEqual({
      ok: false,
      reason: "which",
    });
  });

  it("takes an account named by its nickname, and removes the name", () => {
    const all = [everyday, rainy, card, car];
    expect(chooseAccount("lunch from Everyday", all)).toEqual({
      ok: true,
      account: everyday,
      rest: "lunch",
    });
    expect(chooseAccount("lunch on quicksilver", all)).toMatchObject({
      account: card,
      rest: "lunch",
    });
    expect(chooseAccount("gift from my rainy day", all)).toMatchObject({
      account: rainy,
      rest: "gift",
    });
    expect(chooseAccount("lunch Everyday", all)).toMatchObject({
      account: everyday,
      rest: "lunch",
    });
  });

  it("takes a nickname with the kind of account said after it", () => {
    // Texts a real phone sent that were asked "which account?" again.
    const mine: LogAccount = {
      id: "m",
      nickname: "Muhammad",
      type: "checking",
    };
    const other: LogAccount = {
      id: "s",
      nickname: "Sample · 360 Checking",
      type: "checking",
    };
    expect(
      chooseAccount("I on cloudflare to buy domain from muhammad checking", [
        mine,
        card,
        other,
      ]),
    ).toEqual({
      ok: true,
      account: mine,
      rest: "I on cloudflare to buy domain",
    });
    expect(
      chooseAccount("lunch from my Everyday account", [everyday, card]),
    ).toMatchObject({ account: everyday, rest: "lunch" });
    expect(
      chooseAccount("lunch on the quicksilver credit card", [everyday, card]),
    ).toMatchObject({ account: card, rest: "lunch" });
  });

  it("matches a nickname typed without its punctuation", () => {
    const plus: LogAccount = {
      id: "p",
      nickname: "Sample · Plus",
      type: "savings",
    };
    expect(chooseAccount("lunch from sample plus", [everyday, plus])).toEqual({
      ok: true,
      account: plus,
      rest: "lunch",
    });
    // A nickname with no letters or digits names nothing.
    const dots: LogAccount = { id: "d", nickname: "··", type: "savings" };
    expect(chooseAccount("lunch", [everyday, dots])).toEqual({
      ok: false,
      reason: "which",
    });
  });

  it("takes an account named by its kind when exactly one is of that kind", () => {
    const all = [everyday, rainy, card];
    expect(chooseAccount("gas on card", all)).toMatchObject({
      account: card,
      rest: "gas",
    });
    expect(chooseAccount("gas on my credit card", all)).toMatchObject({
      account: card,
      rest: "gas",
    });
    expect(chooseAccount("gas from savings", all)).toMatchObject({
      account: rainy,
    });
    expect(chooseAccount("gas with debit card", all)).toMatchObject({
      account: everyday,
      rest: "gas",
    });
  });

  it("leaves a matching word inside the description alone", () => {
    // "card" is what they bought, not where it was paid from.
    expect(chooseAccount("birthday card", [everyday])).toEqual({
      ok: true,
      account: everyday,
      rest: "birthday card",
    });
    expect(chooseAccount("everyday snacks", [everyday])).toMatchObject({
      rest: "everyday snacks",
    });
  });

  it("asks when the kind fits none or several", () => {
    const twoCards = [
      everyday,
      card,
      { ...card, id: "a5", nickname: "Venture" },
    ];
    expect(chooseAccount("gas on card", twoCards)).toEqual({
      ok: false,
      reason: "which",
    });
    expect(chooseAccount("gas on card", [everyday, rainy])).toEqual({
      ok: false,
      reason: "which",
    });
    expect(chooseAccount("lunch on visa", [everyday, card])).toEqual({
      ok: false,
      reason: "which",
    });
  });

  it("asks when two accounts share the nickname", () => {
    const twins = [everyday, { ...everyday, id: "a6" }];
    expect(chooseAccount("lunch from everyday", twins)).toEqual({
      ok: false,
      reason: "which",
    });
  });

  it("never logs on a loan", () => {
    expect(chooseAccount("lunch from car loan", [everyday, car])).toEqual({
      ok: false,
      reason: "loan",
    });
    expect(chooseAccount("lunch on loan", [everyday, car])).toEqual({
      ok: false,
      reason: "loan",
    });
    expect(chooseAccount("lunch", [car])).toEqual({
      ok: false,
      reason: "loan",
    });
  });

  it("has nothing to choose from without accounts", () => {
    expect(chooseAccount("lunch", [])).toEqual({ ok: false, reason: "none" });
  });
});

describe("the replies", () => {
  it("confirms exactly what was logged", () => {
    expect(
      loggedReply({
        amount: cents(1200),
        description: "lunch",
        day: "today",
        account: null,
        category: "Dining",
        budgetLeft: cents(8800),
      }),
    ).toBe(
      'Logged $12.00 for "lunch" today, in Dining. $88.00 left in Dining this month. Text UNDO to remove it.',
    );
    expect(
      loggedReply({
        amount: cents(4000),
        description: "gas",
        day: "yesterday",
        account: "Quicksilver",
        category: null,
        budgetLeft: null,
      }),
    ).toBe(
      'Logged $40.00 for "gas" yesterday on Quicksilver. Text UNDO to remove it.',
    );
  });

  it("leaves the budget line out without a category", () => {
    expect(
      loggedReply({
        amount: cents(500),
        description: "gum",
        day: "today",
        account: null,
        category: null,
        budgetLeft: cents(100),
      }),
    ).toBe('Logged $5.00 for "gum" today. Text UNDO to remove it.');
  });

  it("asks which account, numbering theirs and saying what is waiting", () => {
    expect(
      whichAccountReply(cents(1250), "lunch", ["Everyday", "Quicksilver"]),
    ).toBe(
      'Which account for $12.50 "lunch"? Reply with its number or name: 1 Everyday, 2 Quicksilver. Nothing is logged yet.',
    );
    const many = Array.from({ length: 9 }, (_, i) => `Account ${i + 1}`);
    const reply = whichAccountReply(cents(100), "gum", many);
    expect(reply).toContain("5 Account 5.");
    expect(reply).not.toContain("Account 6");
  });

  it("only gives examples that it would itself read as a log", () => {
    // A real phone was told to send a text that was then not understood.
    const examples = [
      ...Object.values(UNCLEAR_REPLIES),
      ...Object.values(LOG_REPLIES),
    ].flatMap((reply) =>
      [...reply.matchAll(/like "([^"]+)"/g)].map((m) => m[1]!),
    );
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      expect(parseLog(example), example).toMatchObject({ type: "log" });
    }
  });

  it("says what UNDO removed, and when there is nothing", () => {
    expect(undoneReply(cents(1200), "lunch")).toBe(
      'Removed $12.00 for "lunch".',
    );
    expect(LOG_REPLIES.nothingToUndo).toContain("nothing to undo");
  });
});

describe("readAccountAnswer", () => {
  const mine: LogAccount = { id: "m", nickname: "Muhammad", type: "checking" };
  const sampleCard: LogAccount = {
    id: "c",
    nickname: "Sample · Credit Card",
    type: "credit_card",
  };
  const sampleChecking: LogAccount = {
    id: "s",
    nickname: "Sample · 360 Checking",
    type: "checking",
  };
  const all = [mine, sampleCard, sampleChecking];
  const read = (text: string, accounts = all) =>
    readAccountAnswer(text, accounts, accounts);
  const account = (expected: LogAccount) => ({
    type: "account",
    account: expected,
  });
  const UNCLEAR = { type: "unclear" };
  const NOT_AN_ANSWER = { type: "none" };

  it.each<[string, LogAccount]>([
    ["1", mine],
    ["2", sampleCard],
    ["3", sampleChecking],
    ["#2", sampleCard],
    ["2.", sampleCard],
    ["number 3", sampleChecking],
    ["option 1 please", mine],
    ["Muhammad", mine],
    ["muhammad", mine],
    ["from Muhammad", mine],
    ["it was from my muhammad checking account", mine],
    ["muhammad checking", mine],
    ["sample 360 checking", sampleChecking],
    ["Sample · Credit Card", sampleCard],
    ["the sample credit card", sampleCard],
    // A kind of account, when they have exactly one of it.
    ["card", sampleCard],
    ["credit card", sampleCard],
    ["It was on my credit card.", sampleCard],
    ["use the card", sampleCard],
  ])("%j is that account", (text, expected) => {
    expect(read(text)).toEqual(account(expected));
  });

  it.each([
    // Two checking accounts: the kind does not say which.
    "checking",
    "It was from my checking account",
    "debit",
    // A number that is not on the list, and a kind they have none of.
    "4",
    "0",
    "savings",
    "loan",
  ])("%j is an answer that needs asking again", (text) => {
    expect(read(text)).toEqual(UNCLEAR);
  });

  it.each([
    "",
    "how am I doing?",
    "what is on my card?",
    "card?",
    "undo",
    "12 lunch",
    "12 lunch from Muhammad",
    "spent 5 on coffee with card",
    "muhammad said hi",
    "never mind",
    "yes",
    // Written as money, a number is not a place in the list.
    "$2",
    "2.50",
    "360",
    "from my",
  ])("%j is not an answer", (text) => {
    expect(read(text)).toEqual(NOT_AN_ANSWER);
  });

  it("counts places in the list it was shown, and names among all accounts", () => {
    // Six accounts, five listed: the sixth is reachable by name only.
    const six = Array.from({ length: 6 }, (_, i): LogAccount => ({
      id: `id${i + 1}`,
      nickname: `Pot ${"abcdef"[i]}`,
      type: "savings",
    }));
    const listed = six.slice(0, 5);
    expect(readAccountAnswer("5", listed, six)).toEqual(account(six[4]!));
    expect(readAccountAnswer("6", listed, six)).toEqual(UNCLEAR);
    expect(readAccountAnswer("pot f", listed, six)).toEqual(account(six[5]!));
  });

  it("asks again when two accounts share the name, and prefers the longer name", () => {
    const twin: LogAccount = { id: "t", nickname: "muhammad", type: "savings" };
    expect(read("Muhammad", [mine, twin])).toEqual(UNCLEAR);
    const plus: LogAccount = {
      id: "p",
      nickname: "Savings Plus",
      type: "savings",
    };
    const short: LogAccount = { id: "q", nickname: "Plus", type: "checking" };
    expect(read("savings plus", [short, plus])).toEqual(account(plus));
  });
});
