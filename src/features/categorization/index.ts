// Pure, client-safe public API. Import from here when integrating F-08.
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
