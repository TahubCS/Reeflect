"use server";

import type { PanelView } from "../domain/panel";
import { writeSummary } from "./summary";

// "Write it with Gemini" on the dashboard (F-15), in ARCH-04 order: session,
// then workspace access at viewer, then the figures for the verified
// workspace id. It only reads, so a viewer may ask.
export async function writeSummaryAction(
  workspaceId: unknown,
): Promise<PanelView | null> {
  return writeSummary(workspaceId);
}
