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

/**
 * An account's own name, at the end of the text: "lunch from Everyday",
 * "lunch Everyday". Only at the end, so a word inside the description that
 * happens to match a nickname is left alone.
 */
const nicknameAtEnd = (nickname: string) =>
  new RegExp(`(?:^| )(?:${WITH} )?(?:(?:my|the) )?${escape(nickname)}$`, "i");

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
    .map((account) => ({ account, nickname: account.nickname.trim() }))
    .filter(
      ({ nickname }) => nickname !== "" && nicknameAtEnd(nickname).test(phrase),
    )
    .sort((a, b) => b.nickname.length - a.nickname.length);
  if (named.length > 0) {
    const best = named.filter(
      ({ nickname }) => nickname.length === named[0]!.nickname.length,
    );
    // Two accounts with the same name: the text cannot tell them apart.
    if (best.length > 1) return { ok: false, reason: "which" };
    const { account, nickname } = best[0]!;
    if (account.type === "loan") return { ok: false, reason: "loan" };
    return {
      ok: true,
      account,
      rest: tidy(phrase.replace(nicknameAtEnd(nickname), " ")),
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
