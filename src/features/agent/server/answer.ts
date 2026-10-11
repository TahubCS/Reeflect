import "server-only";
import { fill } from "@/lib/ai/fill";
import { type AiRequest, generateText } from "@/lib/ai/client";
import { completeDraft } from "../domain/draft";
import { fallbackDraft } from "../domain/fallback";
import { SYSTEM_INSTRUCTION, buildUserInput } from "../domain/prompt";
import type { Facts } from "../domain/summary";
import { getSummary } from "./tools/getSummary";

export type AnswerOptions = {
  /** Replaced in tests; the real one calls Gemini. */
  generate?: (request: AiRequest) => Promise<string>;
  now?: Date;
};

/** The reply code builds by itself, from the same facts and labels. */
function codeBuiltReply(facts: Facts): string {
  const filled = fill(
    fallbackDraft(facts),
    facts.values as Record<string, string>,
  );
  if (!filled.ok) throw new Error(`fallback reply: ${filled.reason}`);
  return filled.text;
}

/**
 * Answers one text from a linked phone (F-25). Code works out the figures;
 * a model writes the sentence around their labels; code checks the draft
 * and puts the figures in. If no model answers, or the draft breaks the
 * rules, the reply is built by code instead (ADR-019, ADR-040).
 */
export async function answer(
  text: string,
  workspaceId: string,
  options: AnswerOptions = {},
): Promise<string> {
  const facts = await getSummary(workspaceId, options.now);
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
  return codeBuiltReply(facts);
}
