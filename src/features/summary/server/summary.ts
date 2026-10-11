import "server-only";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { getSummary } from "@/features/agent";
import { type Facts, completeDraft } from "@/features/agent/client";
import { type AiRequest, generateLongText } from "@/lib/ai/client";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import { fallbackPanel } from "../domain/fallback";
import {
  DAILY_WRITES,
  type Panel,
  type PanelState,
  type PanelView,
  type WriteResult,
  checkPanel,
  completePanel,
} from "../domain/panel";
import { panelRequest } from "../domain/prompt";
import {
  countWrites,
  latestDraft,
  reserveWrite,
  saveDraft,
} from "./repository";

export type SummaryOptions = {
  /** Replaced in tests; the real one calls Gemini. */
  generate?: (request: AiRequest) => Promise<string>;
  now?: Date;
};

/** "9:41 AM", in the app's time zone, formatted here so every reader agrees. */
const timeOfDay = (at: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(at);

/** The session's user and the workspace they may read (ARCH-04). */
async function reader(workspaceId: unknown) {
  const session = await getSession();
  const access = await requireWorkspaceAccess(session, workspaceId, "viewer");
  // `requireWorkspaceAccess` is not found without a session.
  return { workspaceId: access.workspaceId, userId: session!.user.id };
}

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

/**
 * What the panel shows now: the newest draft a model wrote for this
 * workspace today, filled with the figures as they are now, or the
 * code-built panel. A stored draft that no longer passes the check (a
 * figure it used is gone) is left out, never half-filled.
 */
async function shown(
  workspaceId: string,
  facts: Facts,
  built: PanelView,
  today: string,
): Promise<PanelView> {
  const stored = await latestDraft(workspaceId, today);
  if (stored === null) return built;
  const checked = checkPanel(stored.draft, facts);
  if (!checked.ok) return built;
  return {
    source: "model",
    ...checked.panel,
    writtenAt: timeOfDay(stored.writtenAt),
  };
}

/** A model's panel, or null when none answered or its draft broke a rule. */
async function modelWritten(
  facts: Facts,
  generate: (request: AiRequest) => Promise<string>,
): Promise<{ draft: Panel; panel: Panel } | null> {
  try {
    const checked = completePanel(await generate(panelRequest(facts)), facts);
    if (checked.ok) return checked;
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
 * What the dashboard's panel shows when the page opens (F-15, ADR-068),
 * with no model call: today's summary if a member had Gemini write one,
 * else the one built by code. Null when there is nothing to show: no
 * accounts yet, or the figures could not be read. The calendar beside it
 * does not depend on this, so a failed read is logged and the panel is left
 * out.
 */
export async function loadSummaryPanel(
  workspaceId: unknown,
  now: Date = new Date(),
): Promise<PanelState | null> {
  const access = await reader(workspaceId);
  try {
    const facts = await getSummary(access.workspaceId, now);
    const built = codeBuilt(facts);
    if (built === null) return null;
    const today = isoDateIn(now, DEFAULT_TIME_ZONE);
    const [view, asked] = await Promise.all([
      shown(access.workspaceId, facts, built, today),
      countWrites(access.userId, today),
    ]);
    return { view, remaining: Math.max(0, DAILY_WRITES - asked) };
  } catch (error) {
    console.error("summary: panel not built", {
      workspaceId: access.workspaceId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

/**
 * The panel written by Gemini, for a member who asked (ADR-045, ADR-068).
 * Each person may ask `DAILY_WRITES` times a day; past that no model is
 * called. Code works out the figures; the model is sent their labels only
 * and writes around them; code checks every sentence and puts the figures
 * in. The draft is kept in label form for the rest of the day. When no
 * model answers, or its draft breaks a rule, what the panel showed before
 * comes back with the same figures.
 */
export async function writeSummary(
  workspaceId: unknown,
  options: SummaryOptions = {},
): Promise<WriteResult | null> {
  const access = await reader(workspaceId);
  const now = options.now ?? new Date();
  const facts = await getSummary(access.workspaceId, now);
  const built = codeBuilt(facts);
  if (built === null) return null;

  const today = isoDateIn(now, DEFAULT_TIME_ZONE);
  const before = () => shown(access.workspaceId, facts, built, today);
  const reserved = await reserveWrite(
    access.workspaceId,
    access.userId,
    today,
    DAILY_WRITES,
  );
  if (reserved === null) {
    return { view: await before(), remaining: 0, outcome: "limit" };
  }
  const { remaining } = reserved;
  const written = await modelWritten(
    facts,
    options.generate ?? generateLongText,
  );
  if (written === null) {
    return { view: await before(), remaining, outcome: "no_answer" };
  }
  await saveDraft(access.workspaceId, reserved.id, written.draft);
  return {
    view: { source: "model", ...written.panel, writtenAt: timeOfDay(now) },
    remaining,
    outcome: "written",
  };
}
