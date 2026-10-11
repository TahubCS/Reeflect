// Server and page exports for the Insights route (F-35). Kept apart from
// ./index, which `scripts/batch` imports and must stay free of server-only
// modules.
export { yesterday } from "./domain/periods";
export { type InsightsView, getInsights } from "./server/insights";
// For the agent (F-25), which answers from the same figures as the page.
export { loadWorkspaceData } from "./server/repository";
export { InsightsPage } from "./ui/insights-page";
