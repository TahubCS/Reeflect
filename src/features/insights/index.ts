// F-35's public interface (ADR-055). Domain functions are pure, so
// `scripts/batch` computes sample figures with the same code as the page.
// Server functions and the page component are exported from ./server.
export {
  type AccountKind,
  type MeasureKey,
  type Measures,
  type StoredMeasures,
} from "./domain/metrics";
export { PERIOD_DAYS, type PeriodDays, periodEnding } from "./domain/periods";
export {
  type WorkspaceData,
  sampleFigures,
  workspaceMeasures,
} from "./domain/workspace";
