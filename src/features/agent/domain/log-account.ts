// Which account a text's spending belongs to (F-27, ADR-064). With several
// accounts and none named, the answer is to ask: the agent never picks one
// for the person. Pure: the accounts are handed in.

export type LogAccount = {
  id: string;
  nickname: string;
  type: "checking" | "savings" | "credit_card" | "loan";
};

export type AccountChoice =
  | {
      ok: true;
      account: LogAccount;
      /** The phrase with the account's name taken out; filler not trimmed. */
      rest: string;
    }
  | {
      ok: false;
      /**
       * `none`: no accounts at all. `loan`: they named a loan, or have only
       * loans. `which`: several fit and the text does not say, or it names
       * a kind of account they have none or several of.
       */
      reason: "none" | "loan" | "which";
    };

// How people name a kind of account. Longer phrases first, so "debit card"
// is not read as "card".
const KIND_PHRASES: readonly [string, LogAccount["type"]][] = [
  ["credit card", "credit_card"],
  ["debit card", "checking"],
  ["checking account", "checking"],
  ["savings account", "savings"],
  ["card", "credit_card"],
  ["credit", "credit_card"],
  ["checking", "checking"],
  ["chequing", "checking"],
  ["debit", "checking"],
  ["savings", "savings"],
  ["saving", "savings"],
  ["loan", "loan"],
];

const WITH = "(?:on|from|with|using|via|in|to)";
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A word people add after an account's name: "from Everyday checking". */
const KIND_AFTER_NAME =
  "(?:credit card|debit card|checking|chequing|savings|saving|credit|debit|card|account|acct)";

/**
 * A nickname's letters and digits as a pattern, with anything else between
 * them optional to type: "Sample · Plus" is matched by "sample plus".
 * Null when the nickname has no letters or digits.
 */
function nicknamePattern(nickname: string): string | null {
  const parts = nickname.split(/[^\p{L}\p{N}]+/u).filter((part) => part !== "");
  return parts.length === 0 ? null : parts.map(escape).join("[^\\p{L}\\p{N}]+");
}

/**
 * An account's own name, at the end of the text: "lunch from Everyday",
 * "lunch Everyday", "lunch from Everyday checking". Only at the end, so a
 * word inside the description that happens to match a nickname is left
 * alone.
 */
const nicknameAtEnd = (pattern: string) =>
  new RegExp(
    `(?:^| )(?:${WITH} )?(?:(?:my|the) )?${pattern}(?: ${KIND_AFTER_NAME}){0,2}$`,
    "iu",
  );

/** A kind is a name only after "on", "from" and so on: "lunch on card". */
const kindAtEnd = (phrase: string) =>
  new RegExp(`(?:^| )${WITH} (?:(?:my|the) )?${escape(phrase)}$`, "i");

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The account for a log, from the person's own words (`phrase` from
 * `parseLog`, with "on" and "from" still in it) and the workspace's
 * accounts.
 */
export function chooseAccount(
  phrase: string,
  accounts: readonly LogAccount[],
): AccountChoice {
  if (accounts.length === 0) return { ok: false, reason: "none" };

  // A nickname is the surest name. Longest first, so "Savings Plus" wins
  // over an account called "Plus".
  const named = accounts
    .map((account) => ({
      account,
      nickname: account.nickname.trim(),
      pattern: nicknamePattern(account.nickname),
    }))
    .filter(
      (candidate): candidate is typeof candidate & { pattern: string } =>
        candidate.pattern !== null &&
        nicknameAtEnd(candidate.pattern).test(phrase),
    )
    .sort((a, b) => b.nickname.length - a.nickname.length);
  if (named.length > 0) {
    const best = named.filter(
      ({ nickname }) => nickname.length === named[0]!.nickname.length,
    );
    // Two accounts with the same name: the text cannot tell them apart.
    if (best.length > 1) return { ok: false, reason: "which" };
    const { account, pattern } = best[0]!;
    if (account.type === "loan") return { ok: false, reason: "loan" };
    return {
      ok: true,
      account,
      rest: tidy(phrase.replace(nicknameAtEnd(pattern), " ")),
    };
  }

  for (const [kind, type] of KIND_PHRASES) {
    const pattern = kindAtEnd(kind);
    if (!pattern.test(phrase)) continue;
    if (type === "loan") return { ok: false, reason: "loan" };
    const ofKind = accounts.filter((account) => account.type === type);
    if (ofKind.length !== 1) return { ok: false, reason: "which" };
    return {
      ok: true,
      account: ofKind[0]!,
      rest: tidy(phrase.replace(pattern, " ")),
    };
  }

  const spendable = accounts.filter((account) => account.type !== "loan");
  if (spendable.length === 0) return { ok: false, reason: "loan" };
  if (spendable.length > 1) return { ok: false, reason: "which" };
  return { ok: true, account: spendable[0]!, rest: phrase };
}

/** What a text says when the agent has asked "which account?" (ADR-065). */
export type AccountAnswer =
  | { type: "account"; account: LogAccount }
  /** An answer, but not to exactly one account: ask again. */
  | { type: "unclear" }
  /** Not an answer at all: the text is handled as any other. */
  | { type: "none" };

// Words around the answer that say nothing: "it was from my checking account".
const ANSWER_FILLER = new Set([
  "a",
  "i",
  "it",
  "its",
  "was",
  "is",
  "that",
  "from",
  "on",
  "with",
  "using",
  "via",
  "in",
  "to",
  "my",
  "the",
  "use",
  "used",
  "put",
  "paid",
  "one",
  "number",
  "option",
  "account",
  "acct",
  "please",
  "pls",
]);

const KINDS = new Map(KIND_PHRASES);
const KIND_WORDS = new Set(
  KIND_PHRASES.flatMap(([phrase]) => phrase.split(" ")),
);

/** Lower-case letters and digits only: "It's #2." is ["its", "2"]. */
const wordsOf = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");

/** Where `part` sits in `whole` as a run of words, or -1. */
function runIndex(whole: readonly string[], part: readonly string[]): number {
  for (let start = 0; start + part.length <= whole.length; start += 1) {
    if (part.every((word, offset) => whole[start + offset] === word)) {
      return start;
    }
  }
  return -1;
}

/**
 * Reads a reply to "which account?". Strict on purpose: the whole text must
 * be the answer (a listed number, an account's name, or a kind of account,
 * with filler around it), so a question or new spending that mentions an
 * account is never taken for one.
 *
 * `listed` are the accounts in the order they were numbered; `accounts` are
 * all the accounts that can hold spending.
 */
export function readAccountAnswer(
  text: string,
  listed: readonly LogAccount[],
  accounts: readonly LogAccount[],
): AccountAnswer {
  if (text.trim().endsWith("?")) return { type: "none" };
  const words = wordsOf(text);

  // A nickname is the surest answer; the longest one that fits wins.
  const named = accounts
    .map((account) => {
      const nickname = wordsOf(account.nickname);
      const at = nickname.length === 0 ? -1 : runIndex(words, nickname);
      return { account, at, length: nickname.length };
    })
    .filter(({ at }) => at >= 0)
    .sort((a, b) => b.length - a.length);
  if (named.length > 0) {
    const best = named.filter(({ length }) => length === named[0]!.length);
    const { account, at, length } = best[0]!;
    const rest = [...words.slice(0, at), ...words.slice(at + length)];
    // "Everyday checking" is still the account called Everyday.
    const onlyTheName = rest.every(
      (word) => ANSWER_FILLER.has(word) || KIND_WORDS.has(word),
    );
    if (!onlyTheName) return { type: "none" };
    return best.length > 1 ? { type: "unclear" } : { type: "account", account };
  }

  const rest = words.filter((word) => !ANSWER_FILLER.has(word));
  if (rest.length === 0) return { type: "none" };

  // "2", "#2", "number 2": the place in the list. Written as money ("$2",
  // "2.50") it is not an answer.
  if (rest.length === 1 && /^\d{1,2}$/.test(rest[0]!)) {
    if (/\$|\d[.,]\d/.test(text)) return { type: "none" };
    const account = listed[Number(rest[0]) - 1];
    return account ? { type: "account", account } : { type: "unclear" };
  }

  const kind = KINDS.get(rest.join(" "));
  if (kind === undefined) return { type: "none" };
  const ofKind = accounts.filter((account) => account.type === kind);
  return ofKind.length === 1
    ? { type: "account", account: ofKind[0]! }
    : { type: "unclear" };
}
