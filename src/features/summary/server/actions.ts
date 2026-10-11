"use server";

import type { WriteResult } from "../domain/panel";
import { writeSummary } from "./summary";

// "Write it with Gemini" on the dashboard (F-15), in ARCH-04 order: session,
// then workspace access at viewer, then the figures for the verified
// workspace id. A viewer may ask: the only thing written is the draft the
// workspace's own panel shows, and each person has a daily limit (ADR-068).
export async function writeSummaryAction(
  workspaceId: unknown,
): Promise<WriteResult | null> {
  return writeSummary(workspaceId);
}
