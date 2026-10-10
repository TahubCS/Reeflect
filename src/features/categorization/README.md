# Categorization engine (F-08, ADR-013)

Import the public API from `@/features/categorization`. This module is pure
TypeScript with Zod validation: no database, auth, network, logging, money
arithmetic, or React. It is not connected to the app yet.

```ts
import { categorizeTransaction } from "@/features/categorization";

const result = categorizeTransaction({
  descriptionRaw: "CORNER MARKET STORE #0042 REF ABC123",
  // Load only rules and category ids from the caller's verified workspace.
  rules: [
    {
      id: "rule-groceries",
      categoryId: "category-groceries",
      pattern: "market",
      matchType: "contains",
      priority: 10,
    },
  ],
});

if (result.success) {
  // merchantNormalized: "corner market"
  // categoryId: "category-groceries"
  // matchedRuleId: "rule-groceries"
  // origin: "rule"
  // Apply only the category fields, keeping transaction metadata unchanged.
} else {
  // Show the validation issues and write nothing.
}
```

## Rules

- `contains`, `starts_with`, and `exact` use literal normalized strings.
  A pattern such as `.*` is not a regular expression.
- Highest numeric priority wins. Equal priorities use the smallest rule id
  by JavaScript string ordering, independent of the supplied array order.
- Merchant and pattern normalization lowercases, applies Unicode NFKC,
  collapses whitespace, and removes explicit store/location and numeric
  reference/auth/transaction markers. A trailing `#123` is a store number.
  Meaningful digits such as `7-Eleven`, `Studio 54`, and `24 Hour Fitness`
  are preserved. Normalization is conservative, not a general statement parser.
- A nonempty `manualCategoryId` wins over matching rules. Null or absent
  means no manual override. The caller must preserve this override on re-import.
- No match returns `categoryId: null`, `matchedRuleId: null`, and
  `origin: "uncategorized"`; show “Uncategorized”. No category id is fabricated.
- `origin` describes categorization; it does not replace transaction `source`.
- Invalid input returns `{ success: false, error }`, distinct from an unknown
  merchant. Blank/metadata-only patterns, duplicate rule ids, unknown match
  types, unsafe priorities and oversized inputs are rejected. Do not persist
  a failed result. `categoryRuleSchema` is exported for save-rule validation.
- Limits: 2,000 characters per description, 500 per pattern, 128 per id, and
  1,000 rules per call. Priorities are safe integers and may be negative.
- Inputs are not mutated. Only the description, scoped rules and optional
  manual category are accepted; pass these explicitly, not a whole transaction.

## Integration still needed

The current transaction schema has no category column, and category/rule
tables and the manual transaction UI are not built. This is the engine
milestone, not the complete user-facing F-08 feature. Persistence and its
Playwright flow must land with a coordinated integration change (TEST-02).

Consumers must authorize workspace access before loading or saving rules,
validate that category ids belong to that workspace, and handle the result
before any write. The engine cannot verify database ownership. Amounts, dates,
accounts, source and transfer classification remain the caller's responsibility.
