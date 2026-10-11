// Server and page exports for the Insights route (F-35). Kept apart from
// ./index, which `scripts/batch` imports and must stay free of server-only
// modules.
export { type InsightsView, getInsights } from "./server/insights";
export { InsightsPage } from "./ui/insights-page";
