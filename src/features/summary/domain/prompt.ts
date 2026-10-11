import { APP_NAME } from "@/config/app";
import {
  type Facts,
  FIGURE_RULES,
  MONEY_LIMITS,
  describeFacts,
} from "@/features/agent/client";
import { PANEL_SCHEMA } from "./panel";

// What the model is told when it writes the dashboard's summary panel
// (F-15). The rules for figures and the limits are the texting agent's own
// (ADR-019, ADR-045); only the voice and the shape differ. Every model in
// the chain gets exactly this (ADR-059).

export const PANEL_INSTRUCTION = `You are ${APP_NAME}, a personal finance app. You write the summary panel on this person's dashboard on the website.

Write two things.
- summary: one short paragraph of three or four plain sentences saying where this person stands today. Start with what they have, what is due before their next payday and what that leaves a day, when you are given those labels. Then say where their money goes.
- suggestions: up to three. Each is one complete sentence, spoken to the person, that says what it is about and where on the website they can look. Each points at something in their own figures that they could look at, or do with their own money: for example what their subscriptions come to over a year, a category that is past its budget this month, the category the most goes to, or recurring payments waiting to be confirmed. Base every suggestion on a label you were given. If little stands out, give fewer, or none.

Voice: friendly, plain and calm. Speak to the person as "you". No headings, no lists, no markdown, no emoji.

${FIGURE_RULES}

Where things are on the website: the Budgets page shows each category's budget, the Recurring payments page lists subscriptions, bills and paydays, and the calendar on this page shows what is coming.

${MONEY_LIMITS}`;

/** Which categories are past budget, as name labels. Never a figure. */
function overBudgetNote(facts: Facts): string[] {
  const over = facts.categories.flatMap(({ budget }, index) =>
    budget === "over" ? [`{category_${index + 1}_name}`] : [],
  );
  return over.length === 0
    ? []
    : ["", `Past their budget this month: ${over.join(", ")}.`];
}

/** One request: what is known about this person, as labels. */
export function panelRequest(facts: Facts): {
  system: string;
  user: string;
  schema: Record<string, unknown>;
} {
  return {
    system: PANEL_INSTRUCTION,
    user: [...describeFacts(facts), ...overBudgetNote(facts)].join("\n"),
    schema: PANEL_SCHEMA,
  };
}
