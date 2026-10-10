// Synthetic data generator (ADR-049). Used by the batch scripts, and later by
// `pnpm db:seed` (F-21) and the statement fixtures (TEST-08).
export {
  checkExpansion,
  checkSpec,
  monthlyFixedCosts,
  monthlyIncome,
  personStats,
  statsWindow,
  TAKE_HOME_BANDS,
  type PersonStats,
  type Warning,
} from "./domain/check";
export {
  expandPerson,
  expandSpec,
  GENERATOR_VERSION,
  spanEnd,
  type AccountKey,
  type Expansion,
  type GeneratedAccount,
  type GeneratedPerson,
  type GeneratedTransaction,
} from "./domain/expand";
export {
  CATEGORIES,
  PERSONAS,
  parseSpec,
  specSchema,
  type Persona,
  type Spec,
  type SpecInput,
} from "./domain/spec";
