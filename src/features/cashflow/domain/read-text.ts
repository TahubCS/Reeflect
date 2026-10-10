import { type Cents, parseDollars } from "@/lib/money";

// Reads a text message with plain rules, no AI. The amount always comes from
// the person's own words.

export type TextIntent =
  | { type: "spend" | "income"; amount: Cents; name: string; category: string }
  | { type: "status" }
  | { type: "unknown" };

const AMOUNT = String.raw`\$?([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|bucks)?`;
const SPEND = new RegExp(
  String.raw`^(?:i\s+)?(?:spent|paid|bought)\s+${AMOUNT}\s*(?:on|for|at)?\s*(.*)$`,
  "i",
);
const INCOME = new RegExp(
  String.raw`^(?:i\s+)?(?:got|received|earned)\s+${AMOUNT}\s*(?:from|for)?\s*(.*)$`,
  "i",
);
const STATUS = /how am i doing|how much|where do i stand|balance|status/i;

const CATEGORY_WORDS: [RegExp, string][] = [
  [/grocer|market|supermarket/i, "Groceries"],
  [
    /lunch|dinner|breakfast|pizza|taco|burger|restaurant|takeout|food/i,
    "Eating out",
  ],
  [/coffee|latte|cafe|tea/i, "Coffee"],
  [/gas|bus|train|uber|lyft|taxi|parking|fare/i, "Transport"],
  [/cloth|shoes|shirt|amazon|shop/i, "Shopping"],
  [/movie|game|concert|bar|drinks/i, "Fun"],
];

function tidyName(raw: string, fallback: string) {
  const name = raw
    .replace(/[.!?]+$/, "")
    .trim()
    .slice(0, 40);
  return name ? name[0].toUpperCase() + name.slice(1) : fallback;
}

export function readText(text: string): TextIntent {
  const message = text.trim();
  const spend = SPEND.exec(message);
  const income = spend ? null : INCOME.exec(message);
  const match = spend ?? income;
  if (match) {
    const amount = parseDollars(match[1]);
    if (!amount) return { type: "unknown" };
    if (income) {
      return {
        type: "income",
        amount,
        name: tidyName(match[2], "Money in"),
        category: "Pay",
      };
    }
    const category =
      CATEGORY_WORDS.find(([words]) => words.test(match[2]))?.[1] ?? "Other";
    return {
      type: "spend",
      amount,
      name: tidyName(match[2], category),
      category,
    };
  }
  return STATUS.test(message) ? { type: "status" } : { type: "unknown" };
}
