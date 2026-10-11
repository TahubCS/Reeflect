# Transaction categorization (F-08, ADR-013)

The Transactions page at `/w/[workspaceId]/transactions` reads real workspace
transactions. It shows a category and whether it comes from a manual choice,
a saved rule, or no match. Editors and owners can:

- Change a transaction's category, including explicitly choosing Uncategorized.
- Save that choice as a merchant rule in the same operation.
- Return a manual choice to automatic categorization.
- Add, edit and delete literal merchant rules, with delete confirmation.
- Rename the preset categories (eighteen, ADR-055).

Viewers can read these results; they cannot write or initialize categories.
Unknown merchants remain Uncategorized until a rule or manual choice exists.
The transaction list is paginated at 50 rows per page. A failed load has a
route-local retry screen, and a failed write returns a safe form error.

## Persistence and authorization

Migration `0005_categorization.sql` adds `category`, `category_rule`, and
`transaction.category_id` / `transaction.category_is_manual`. The migration is
additive: existing transactions start without a manual override. It does not
change amounts, account balances, dates, transaction source or transfer flags.
Run the migration before deploying this branch's application code.

The first authorized editor visit initializes the preset categories
idempotently; a workspace seeded with fewer gains the new ones then.
The seed key preserves renamed categories and avoids duplicates during
concurrent visits. Categories and rules belong to one workspace; composite
foreign keys prevent cross-workspace category assignments.

Every server action calls `requireWorkspaceAccess` at editor level, validates
bound ids and form input with Zod, then passes the verified workspace to the
repository. Every repository query scopes its reads and writes to that
workspace. The page authorizes viewer access and only initializes categories
when the verified role is editor or owner. No shared financial-data caches.

Saving an override and optional rule is one database transaction. Rule changes
materialize categories for existing automatic transactions in the same
transaction. Manual choices, including manual Uncategorized, are preserved.
Effective automatic categories are also recomputed on read, so a newly
imported row is categorized immediately when shown. Manual choices can only be
cleared by explicitly selecting “Use rules automatically”. Re-importers must
preserve `category_is_manual` and `category_id` on existing rows.

## Public APIs

Server callers import from `@/features/categorization`:

- `getCategorizationPage(verifiedWorkspaceId, page, transactionIds?)` returns
  effective categories, rules and transactions from a consistent database
  snapshot. It paginates by default; optional ids select workspace-owned rows
  for the existing transaction screen's account filter and pagination.
- `getCategoryMetadata(verifiedWorkspaceId, description, override?, executor?)`
  computes category fields inside a transaction writer's database transaction.
  F-04 creation and editing use it to save categories with their existing
  balance updates and preserve manual category choices on edits.
- `listCategories` and `listRules` return only the verified workspace's rows.
- `applyCategoryRules(verifiedWorkspaceId, transactionIds?)` is the post-import
  hook for materializing automatic category ids after an import commits.
  Passing ids restricts the work to those workspace-owned rows; an empty list
  changes nothing. Manual rows are never overwritten.

These repository APIs require the caller to authorize the workspace first.
Import/sync features should call the post-import hook before using stored
category ids in aggregates. Categorization composes into the existing F-04
transaction screen, preserving add/edit/delete, account filtering and grouping
by day. CSV/PDF import and bank sync remain separate features (F-05 through
F-07, F-23). The synthetic batch loader can also supply demo transactions.

Client or pure domain callers import from `@/features/categorization/client`:

```ts
import { categorizeTransaction } from "@/features/categorization/client";

const result = categorizeTransaction({
  descriptionRaw: "CORNER MARKET STORE #0042 REF ABC123",
  rules: [{
    id: "rule-groceries",
    categoryId: "category-groceries",
    pattern: "market",
    matchType: "contains",
    priority: 10,
  }],
});
// On success: merchantNormalized = "corner market", categoryId =
// "category-groceries", matchedRuleId = "rule-groceries", origin = "rule".
// On failure: { success: false, error: ZodError }; do not persist a failed result.
```

The pure engine has no I/O, React or money arithmetic. The default feature
entry point also exports server APIs; client code uses the separate public
`client.ts` entry point to keep server-only modules out of its bundle.

## Matching and validation

- `contains`, `starts_with`, and `exact` compare literal normalized strings.
  User patterns are never executed as regular expressions or code.
- Highest priority wins; ties use the lexicographically smallest rule id,
  independent of array order. Saved form priorities range from -1,000,000
  to 1,000,000; the pure engine accepts safe integers.
- Normalization applies Unicode NFKC, lowercase and collapsed whitespace,
  conservatively stripping explicit store/location and numeric reference/auth
  metadata. For example, `WALMART #1234 RALEIGH NC` and
  `WALMART #5678 DURHAM NC` both match the exact keyword `walmart`.
  Meaningful digits in `7-Eleven`, `Studio 54`, and `24 Hour Fitness`
  are preserved. It does not replace institution-specific statement parsing.
- A nonempty `manualCategoryId` wins. `manualOverride: true` also permits an
  explicit manual Uncategorized result (`categoryId: null`). Null or absent
  category id without that flag means no manual override.
- `origin` is categorization provenance, distinct from transaction `source`.
- Engine bounds: 2,000 description characters, 500 pattern characters,
  128 id characters and 1,000 rules. Blank/metadata-only patterns, duplicate
  rule ids, invalid modes/types and unsafe priorities fail validation.
- Historical descriptions over the engine limit remain visible. Their
  automatic category is Uncategorized; their manual choices remain usable.
- Inputs are never mutated. Database writes only change category metadata,
  normalized merchant and update time, retaining financial facts.

## Tests

Adjacent Vitest tests cover the engine and form boundaries, real PostgreSQL
persistence, rollback after a rule insert, rule limits, pagination, bulk
updates, unchanged money, workspace constraints and cascades. Every action is
registered in the shared workspace isolation matrix (TEST-06).

`tests/e2e/categorization.spec.ts` covers the production UI's manual/rule flow,
existing and later matches, manual transaction creation/editing, priority
edits, deletion, category renaming,
validation, viewer/stranger access, pagination, 360px dark/reduced-motion use,
and error recovery. See HANDOFF.md for the final verification results.
