import type { MessageKind } from "@reeflect/agent-protocol";
import { APP_NAME } from "@/config/app";

// Replies to texts that are not a question about money: help, hello,
// thanks, and things the agent cannot read (ADR-066). Written by code, so
// they work the same with or without a model, and none carries financial
// data. Pure: no I/O.

/** What the agent can do, as a text. Examples only; no figures. */
export const HELP_REPLY = `Here's what you can text me: "how am I doing?" for your balance and what's due before payday, "how much on food?" for a category this month, "12 lunch" to log spending (UNDO takes it back), "quiet hours 11pm to 7am" to change when I text you, and STOP to unlink this phone.`;

export const CHAT_REPLIES = {
  help: HELP_REPLY,
  greeting: `Hi, it's ${APP_NAME}. ${HELP_REPLY}`,
  thanks: "Anytime. Text me whenever you want to check in.",
  offTopic: `I can only help with your money and ${APP_NAME}. Try "how am I doing?", or text HELP to see what I can do.`,
  attachment: `I can only read text for now, so I can't see photos or files. To log spending, send it like "12 lunch".`,
  voice: `I can't listen to voice notes yet. Text me instead, like "how am I doing?".`,
  edit: "I saw an edit, but I go by the first version of a text. If it was spending I logged, text UNDO and send it again.",
  group: "I only answer one-to-one chats. Text me directly instead.",
  slowDown: "You're sending a lot at once. Give me a minute, then try again.",
  summaryUnavailable:
    "I can't reach your numbers right now. Please try again in a minute.",
} as const;

export type SmallTalk = "help" | "greeting" | "thanks";

/** Lower case, smart quotes straightened, punctuation and emoji gone. */
function plain(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME = APP_NAME.toLowerCase();

const HELP = new Set([
  "",
  "help",
  "help me",
  "menu",
  "commands",
  "options",
  "info",
  "start",
  "what can you do",
  "what do you do",
  "what can i do",
  "what can i say",
  "what can i ask",
  "what can i text",
  "what can i ask you",
  "how does this work",
  "how do i use this",
  "how do you work",
  "what are you",
  "who are you",
]);

const GREETINGS = new Set([
  "hi",
  "hii",
  "hello",
  "helo",
  "hey",
  "heyy",
  "hiya",
  "yo",
  "sup",
  "hi there",
  "hey there",
  "hello there",
  "good morning",
  "good afternoon",
  "good evening",
  "morning",
]);

const THANKS = new Set([
  "thanks",
  "thank you",
  "thank u",
  "thx",
  "ty",
  "tysm",
  "ok",
  "okay",
  "ok thanks",
  "okay thanks",
  "ok thank you",
  "k",
  "kk",
  "cool",
  "got it",
  "great",
  "nice",
  "perfect",
  "awesome",
  "sounds good",
  "will do",
  "bye",
  "goodbye",
  "good night",
  "night",
]);

/**
 * A text that is only help, hello or thanks, or null. The whole text must
 * be one of them ("hi how am I doing" is a question), with the agent's name
 * allowed around it ("hey Reeflect").
 */
export function smallTalkOf(text: string): SmallTalk | null {
  const words = plain(text)
    .split(" ")
    .filter((word) => word !== NAME);
  const phrase = words.join(" ");
  // A text of only "?" or emoji is plain-empty: the menu helps most.
  if (HELP.has(phrase)) return "help";
  if (GREETINGS.has(phrase)) return "greeting";
  if (THANKS.has(phrase)) return "thanks";
  return null;
}

/** The fixed reply for content the agent does not read, or null for text. */
export function nonTextReply(kind: MessageKind): string | null {
  if (kind === "attachment") return CHAT_REPLIES.attachment;
  if (kind === "voice") return CHAT_REPLIES.voice;
  if (kind === "edit") return CHAT_REPLIES.edit;
  return null;
}

// Words that make a text about money or the app, for the reply built by
// code when no model answers. A model judges this better; without one,
// anything else gets the polite decline (AGENTS.md section 2).
const MONEY_WORDS =
  /\b(?:money|cash|much|spend|spends|spent|spending|balance|balances|budget|budgets|bill|bills|pay|paid|payday|paycheck|payment|payments|save|saving|savings|saved|account|accounts|card|cards|credit|debit|owe|owed|owing|debt|loan|loans|afford|income|earn|earned|rent|subscription|subscriptions|cost|costs|price|bank|checking|due|doing|broke|finance|finances|financial|dollar|dollars|bucks|transaction|transactions|purchase|purchases|charge|charges|bought|buy|buying|food|groceries|category|categories|summary|overview|status|update|left|week|month|worth|undo|quiet|stop|link)\b|\$|\p{Nd}/iu;

/** Whether a text is about their money or the app, as far as words say. */
export function mentionsMoney(text: string): boolean {
  return MONEY_WORDS.test(text) || plain(text).includes(NAME);
}
