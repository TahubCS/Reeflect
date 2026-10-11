// F-15's public interface for routes (ADR-045, AGENTS.md section 6): the
// dashboard's Gemini summary panel. `loadSummaryPanel` is server-only.
export type { PanelView } from "./domain/panel";
export { writeSummaryAction } from "./server/actions";
export { loadSummaryPanel } from "./server/summary";
export { SummaryPanel } from "./ui/summary-panel";
