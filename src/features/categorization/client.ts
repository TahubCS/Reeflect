// The client-safe public entry point. The default index also exports server
// repositories and actions, following the accounts feature's route API.
export {
  type Categorization,
  type CategorizationInput,
  type CategorizationResult,
  type CategoryRule,
  categorizationInputSchema,
  categorizeTransaction,
  categoryRuleSchema,
} from "./domain/categorize";
export { normalizeMerchant } from "./domain/normalize-merchant";
