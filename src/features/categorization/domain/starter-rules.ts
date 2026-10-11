import type { CategoryRule } from "./categorize";
import type { PresetKey } from "./forms";
import { normalizeMerchant } from "./normalize-merchant";

// Built-in keywords for "Choose for me" (ADR-103, refines ADR-013). A new
// workspace has no saved rules, so without these almost everything typed by
// hand or imported would be Uncategorized. They match whole words of the
// normalized merchant name, rank below every rule the person saves, and are
// never stored: they are rebuilt from this list on every read, so changing
// the list re-categorizes automatic rows everywhere at once.

/**
 * Keywords per preset category. A keyword of several words matches those
 * words in a row. Keep each one specific enough to be right almost always:
 * a wrong guess is worse than Uncategorized.
 */
export const STARTER_KEYWORDS: Readonly<
  Partial<Record<PresetKey, readonly string[]>>
> = {
  groceries: [
    "grocery",
    "groceries",
    "supermarket",
    "kroger",
    "safeway",
    "publix",
    "aldi",
    "trader joe's",
    "trader joes",
    "whole foods",
    "food lion",
    "harris teeter",
    "wegmans",
    "h-e-b",
    "heb",
    "giant eagle",
    "sprouts",
    "lidl",
    "costco",
    "sam's club",
    "instacart",
  ],
  dining: [
    "restaurant",
    "lunch",
    "dinner",
    "breakfast",
    "brunch",
    "coffee",
    "cafe",
    "café",
    "pizza",
    "burger",
    "takeout",
    "starbucks",
    "dunkin",
    "mcdonald's",
    "mcdonalds",
    "chipotle",
    "chick-fil-a",
    "subway",
    "taco bell",
    "wendy's",
    "panera",
    "domino's",
    "dominos",
    "doordash",
    "grubhub",
    "uber eats",
    "ubereats",
  ],
  transport: [
    "uber",
    "lyft",
    "taxi",
    "bus",
    "bus fare",
    "bus pass",
    "train",
    "metro",
    "subway fare",
    "transit",
    "parking",
    "toll",
    "gas",
    "gas station",
    "fuel",
    "shell",
    "exxon",
    "chevron",
    "sunoco",
    "speedway",
    "wawa",
    "sheetz",
    "car wash",
    "oil change",
  ],
  housing: ["rent", "mortgage", "landlord", "hoa", "property management"],
  utilities: [
    "electric",
    "electricity",
    "power bill",
    "water bill",
    "gas bill",
    "sewer",
    "trash",
    "internet",
    "comcast",
    "xfinity",
    "spectrum",
    "verizon",
    "at&t",
    "t-mobile",
    "duke energy",
    "phone bill",
  ],
  shopping: [
    "amazon",
    "target",
    "walmart",
    "best buy",
    "ikea",
    "home depot",
    "lowe's",
    "lowes",
    "clothes",
    "clothing",
    "shoes",
    "etsy",
    "ebay",
  ],
  entertainment: [
    "movie",
    "movies",
    "cinema",
    "concert",
    "tickets",
    "ticketmaster",
    "amc",
    "regal",
    "bowling",
    "steam games",
    "playstation",
    "xbox",
    "nintendo",
  ],
  income: [
    "paycheck",
    "payroll",
    "salary",
    "wages",
    "direct deposit",
    "tax refund",
  ],
  health: [
    "pharmacy",
    "cvs",
    "walgreens",
    "doctor",
    "dentist",
    "dental",
    "hospital",
    "clinic",
    "urgent care",
    "prescription",
    "copay",
    "gym",
    "planet fitness",
  ],
  insurance: [
    "insurance",
    "geico",
    "progressive",
    "state farm",
    "allstate",
    "renters insurance",
    "car insurance",
  ],
  loans: [
    "loan payment",
    "student loan",
    "car payment",
    "auto loan",
    "navient",
    "nelnet",
    "sallie mae",
  ],
  subscriptions: [
    "subscription",
    "netflix",
    "spotify",
    "hulu",
    "disney+",
    "disney plus",
    "hbo max",
    "apple music",
    "icloud",
    "youtube premium",
    "patreon",
  ],
  personal_care: [
    "haircut",
    "barber",
    "salon",
    "nails",
    "spa",
    "ulta",
    "sephora",
  ],
  kids: ["daycare", "childcare", "babysitter", "tuition", "school lunch"],
  gifts: ["gift", "gifts", "birthday gift", "donation", "charity"],
  travel: [
    "hotel",
    "airbnb",
    "flight",
    "airline",
    "delta",
    "american airlines",
    "southwest",
    "united airlines",
    "expedia",
    "booking.com",
    "amtrak",
  ],
  retirement: ["401k", "401(k)", "roth ira", "ira contribution"],
  investing: ["brokerage deposit", "investment deposit"],
};

/** Below any priority a saved rule may have (forms allow −1,000,000 up). */
const STARTER_PRIORITY = -2_000_000;

/** The words of text that is already normalized, ignoring punctuation. */
export function splitWords(normalized: string): string[] {
  return normalized.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
}

/** The words of a name or keyword, ignoring case and punctuation. */
export const words = (text: string): string[] =>
  splitWords(normalizeMerchant(text));

/** True when `needle`'s words appear in `haystack`'s words, in a row. */
export function hasWordsInRow(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  if (needle.length === 0) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, i) => haystack[start + i] === word)) return true;
  }
  return false;
}

/** True when `keyword`'s words appear in `merchant`'s words, in a row. */
export const containsWords = (merchant: string, keyword: string): boolean =>
  hasWordsInRow(words(merchant), words(keyword));

/**
 * The built-in keywords as rules for one workspace, pointing at its preset
 * categories. A longer keyword ranks above a shorter one, so "uber eats" is
 * Dining though "uber" alone is Transport. Presets the workspace has not got
 * yet are skipped.
 */
export function starterRules(
  categories: readonly { id: string; presetKey: string | null }[],
): CategoryRule[] {
  const byPreset = new Map(
    categories.flatMap((c) => (c.presetKey ? [[c.presetKey, c.id]] : [])),
  );
  return Object.entries(STARTER_KEYWORDS).flatMap(([preset, keywords]) => {
    const categoryId = byPreset.get(preset);
    if (categoryId === undefined) return [];
    return (keywords ?? []).map((keyword, index): CategoryRule => ({
      id: `starter:${preset}:${index}`,
      categoryId,
      pattern: keyword,
      matchType: "word",
      priority: STARTER_PRIORITY + words(keyword).length,
    }));
  });
}

/** The workspace's saved rules followed by the built-in ones. */
export function withStarterRules(
  rules: readonly CategoryRule[],
  categories: readonly { id: string; presetKey: string | null }[],
): CategoryRule[] {
  return [...rules, ...starterRules(categories)];
}
