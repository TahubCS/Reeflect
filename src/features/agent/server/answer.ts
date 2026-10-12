import "server-only";
import { fill } from "@/lib/ai/fill";
import { type AiRequest, generateText } from "@/lib/ai/client";
import { CHAT_REPLIES } from "../domain/chat";
import { completeDraft } from "../domain/draft";
import { fallbackDraft } from "../domain/fallback";
import { SYSTEM_INSTRUCTION, buildUserInput } from "../domain/prompt";
import { type Facts, valuesOf } from "../domain/summary";
import { getSummary } from "./tools/getSummary";

export type AnswerOptions = {
  /** Replaced in tests; the real one calls Gemini. */
  generate?: (request: AiRequest) => Promise<string>;
  now?: Date;
};

/**
 * The reply code builds by itself, from the same facts and labels. The
 * text only chooses which sentences are sent (F-28).
 */
function codeBuiltReply(facts: Facts, text: string): string {
  const filled = fill(fallbackDraft(facts, text), valuesOf(facts));
  if (!filled.ok) throw new Error(`fallback reply: ${filled.reason}`);
  return filled.text;
}

/**
 * Answers one text from a linked phone (F-25, F-28). Code works out the
 * figures; a model writes the sentence around their labels; code checks
 * the draft and puts the figures in. If no model answers, or the draft
 * breaks the rules, the reply is built by code instead (ADR-019, ADR-040).
 */
export async function answer(
  text: string,
  workspaceId: string,
  options: AnswerOptions = {},
): Promise<string> {
  let facts: Facts;
  try {
    facts = await getSummary(workspaceId, options.now);
  } catch (error) {
    // No figures to give: say so, rather than fail the whole turn.
    console.error("agent: summary not read", {
      workspaceId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return CHAT_REPLIES.summaryUnavailable;
  }
  try {
    const draft = await (options.generate ?? generateText)({
      system: SYSTEM_INSTRUCTION,
      user: buildUserInput(text, facts),
    });
    const checked = completeDraft(draft, facts);
    if (checked.ok) return checked.text;
    // The reason only: never the draft, which may echo the person's text.
    console.warn("agent: draft rejected", { reason: checked.reason });
  } catch (error) {
    console.warn("agent: no model answered", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
  return codeBuiltReply(facts, text);
}
