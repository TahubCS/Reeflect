// Pure parts of the agent's brain other features may use without server code
// (the pattern in bills/client.ts and recurring/client.ts). The website's
// summary panel (F-15, ADR-045) writes with the same labels and checks.
export { type CheckedDraft, completeDraft } from "./domain/draft";
export { FIGURE_RULES, MONEY_LIMITS, describeFacts } from "./domain/prompt";
export {
  type CalendarFigures,
  type Facts,
  type FactsInput,
  buildFacts,
  valuesOf,
} from "./domain/summary";
