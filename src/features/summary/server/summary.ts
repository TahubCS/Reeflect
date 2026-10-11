import "server-only";
import { getSummary } from "@/features/agent";
import { type Facts, completeDraft } from "@/features/agent/client";
import { type AiRequest, generateLongText } from "@/lib/ai/client";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import { fallbackPanel } from "../domain/fallback";
import { type Panel, type PanelView, completePanel } from "../domain/panel";
import { panelRequest } from "../domain/prompt";

export type SummaryOptions = {
  /** Replaced in tests; the real one calls Gemini. */
  generate?: (request: AiRequest) => Promise<string>;
  now?: Date;
};

/** The panel code builds by itself, checked and filled like a model's. */
function codeBuilt(facts: Facts): PanelView | null {
  const draft = fallbackPanel(facts);
  if (draft === null) return null;
  const fill = (sentence: string) => {
    const checked = completeDraft(sentence, facts);
    if (!checked.ok) throw new Error(`summary panel: ${checked.reason}`);
    return checked.text;
  };
  return {
    source: "code",
    summary: fill(draft.summary),
    suggestions: draft.suggestions.map(fill),
  };
}

/** A model's panel, or null when none answered or its draft broke a rule. */
async function modelWritten(
  facts: Facts,
  generate: (request: AiRequest) => Promise<string>,
): Promise<Panel | null> {
  try {
    const checked = completePanel(await generate(panelRequest(facts)), facts);
    if (checked.ok) return checked.panel;
    // The reason only: never the draft.
    console.warn("summary: draft rejected", { reason: checked.reason });
  } catch (error) {
    console.warn("summary: no model answered", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
  return null;
}

/**
 * What the dashboard's panel shows when the page opens (F-15): the summary
 * built by code, with no model call. Null when there is nothing to show: no
 * accounts yet, or the figures could not be read. The calendar beside it
 * does not depend on this, so a failed read is logged and the panel is left
 * out.
 */
export async function loadSummaryPanel(
  workspaceId: unknown,
  now?: Date,
): Promise<PanelView | null> {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  try {
    return codeBuilt(await getSummary(access.workspaceId, now));
  } catch (error) {
    console.error("summary: panel not built", {
      workspaceId: access.workspaceId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

/**
 * The panel written by Gemini, for a member who asked (ADR-045). Code works
 * out the figures; the model is sent their labels only and writes around
 * them; code checks every sentence and puts the figures in. When no model
 * answers, or its draft breaks a rule, the code-built panel comes back with
 * the same figures (`source: "code"`).
 */
export async function writeSummary(
  workspaceId: unknown,
  options: SummaryOptions = {},
): Promise<PanelView | null> {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const facts = await getSummary(access.workspaceId, options.now);
  const built = codeBuilt(facts);
  if (built === null) return null;
  const written = await modelWritten(
    facts,
    options.generate ?? generateLongText,
  );
  return written === null ? built : { source: "model", ...written };
}
