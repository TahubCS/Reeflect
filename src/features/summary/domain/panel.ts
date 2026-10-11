import { z } from "zod";
import {
  type CheckedDraft,
  type Facts,
  completeDraft,
} from "@/features/agent/client";

// The dashboard's summary panel (F-15, ADR-045): a short paragraph and a few
// suggestions. A model writes them with labels; code checks each sentence the
// same way it checks a text reply and puts the figures in (ADR-019).

export type Panel = { summary: string; suggestions: string[] };

/** What the panel shows, and whether a model or code wrote it. */
export type PanelView = Panel & { source: "model" | "code" };

export const MAX_SUGGESTIONS = 3;
/** One sentence: longer than this and the model wrote a paragraph. */
export const MAX_SUGGESTION_LENGTH = 300;

/** The shape the model's answer must follow. */
export const PANEL_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "suggestions"],
} as const satisfies Record<string, unknown>;

const text = z.string().trim().min(1);
const draftSchema = z.object({ summary: text, suggestions: z.array(text) });

type Rejected = Extract<CheckedDraft, { ok: false }>["reason"];

export type CheckedPanel =
  | { ok: true; panel: Panel }
  | { ok: false; reason: Rejected | "not_json" | "wrong_shape" };

function parse(answer: string): unknown {
  try {
    return JSON.parse(answer);
  } catch {
    return undefined;
  }
}

/**
 * A model's answer, checked and completed. Every sentence must pass
 * `completeDraft`; one that does not rejects the whole answer, so a panel is
 * never half a model's and half code's. Suggestions past the third are
 * dropped.
 */
export function completePanel(answer: string, facts: Facts): CheckedPanel {
  const json = parse(answer);
  if (json === undefined) return { ok: false, reason: "not_json" };
  const draft = draftSchema.safeParse(json);
  if (!draft.success) return { ok: false, reason: "wrong_shape" };

  const summary = completeDraft(draft.data.summary, facts);
  if (!summary.ok) return summary;
  const suggestions: string[] = [];
  for (const suggestion of draft.data.suggestions.slice(0, MAX_SUGGESTIONS)) {
    const checked = completeDraft(suggestion, facts);
    if (!checked.ok) return checked;
    if (checked.text.length > MAX_SUGGESTION_LENGTH) {
      return { ok: false, reason: "too_long" };
    }
    suggestions.push(checked.text);
  }
  return { ok: true, panel: { summary: summary.text, suggestions } };
}
