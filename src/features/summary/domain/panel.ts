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
export type PanelView = Panel & {
  source: "model" | "code";
  /** When a model wrote it, as a time of day in the app's time zone. */
  writtenAt?: string;
};

/** How many times a day one person may ask Gemini to write it (ADR-068). */
export const DAILY_WRITES = 5;

/** The panel, and how many more times this person may ask today. */
export type PanelState = { view: PanelView; remaining: number };

/**
 * What asking did: a model wrote it, no model answered (or its draft broke
 * a rule), or this person has none left today and no model was asked.
 */
export type WriteResult = PanelState & {
  outcome: "written" | "no_answer" | "limit";
};

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
  // `draft` is the answer in label form, as it is stored; `panel` is filled.
  | { ok: true; draft: Panel; panel: Panel }
  | { ok: false; reason: Rejected | "not_json" | "wrong_shape" };

function parse(answer: string): unknown {
  try {
    return JSON.parse(answer);
  } catch {
    return undefined;
  }
}

/**
 * A draft in label form, checked and completed with these figures: a
 * model's answer once parsed, or one stored earlier today and filled again
 * with the figures as they are now. Every sentence must pass
 * `completeDraft`; one that does not rejects the whole draft, so a panel is
 * never half a model's and half code's. Suggestions past the third are
 * dropped.
 */
export function checkPanel(json: unknown, facts: Facts): CheckedPanel {
  const parsed = draftSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "wrong_shape" };
  const draft: Panel = {
    summary: parsed.data.summary,
    suggestions: parsed.data.suggestions.slice(0, MAX_SUGGESTIONS),
  };

  const summary = completeDraft(draft.summary, facts);
  if (!summary.ok) return summary;
  const suggestions: string[] = [];
  for (const suggestion of draft.suggestions) {
    const checked = completeDraft(suggestion, facts);
    if (!checked.ok) return checked;
    if (checked.text.length > MAX_SUGGESTION_LENGTH) {
      return { ok: false, reason: "too_long" };
    }
    suggestions.push(checked.text);
  }
  return { ok: true, draft, panel: { summary: summary.text, suggestions } };
}

/** A model's answer, as the JSON text it sent. */
export function completePanel(answer: string, facts: Facts): CheckedPanel {
  const json = parse(answer);
  if (json === undefined) return { ok: false, reason: "not_json" };
  return checkPanel(json, facts);
}
