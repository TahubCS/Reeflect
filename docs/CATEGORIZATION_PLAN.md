# F-08 categorization implementation plan

Status: full categorization flow implemented on `feat/transaction-categorization`
for [PR #12](https://github.com/TahubCS/Reeflect/pull/12); verification passed:
825 unit/database tests, 74 browser tests and all required checks (HO-037).
The branch began on main `02c5154` and now includes main `adc6312`,
with F-04 manual transactions, phone linking, instant navigation and email
verification. The categorization migration is regenerated as 0005 after
phone linking's 0003 and verification's 0004.

Governed by [PROJECT.md](PROJECT.md) F-08, [ADR-013 and ADR-015](DECISIONS.md),
[ARCH-02 through ARCH-04](ARCHITECTURE.md), and [TEST-02 through TEST-07](TESTING.md).

## Problem and outcome

A transaction such as “CORNER MARKET STORE #0042 REF ABC123” needs a useful
category before budgets and spending summaries can group it. F-08 lets the
user choose Groceries and optionally remember that choice as a rule. A later
Corner Market transaction then becomes Groceries automatically, despite a
different store or reference number. Explicit manual choices take precedence.

The complete flow is on the existing Transactions page: real workspace rows,
manual choices, saving a choice as a rule, rule management, and editable preset
category names. Existing data sources feed the same transaction table; no new
bank connection or AI service is needed. Unknown merchants stay Uncategorized.

Confidence comes from verifying the data and browser flows, including failure
cases. No change can guarantee that the entire application will never crash.

## Scope and coordination

- Use the existing feature branch and update PR #12 with follow-up commits.
- Keep categorization domain, server and UI code in its feature folder.
- Compose category controls and rule management into the F-04 Transactions
  screen, preserving add/edit/delete, account filtering and grouping by day.
- Add categories/rules and transaction category metadata through a generated,
  additive migration, with composite workspace/category foreign keys.
- Extend the existing shared authorization test matrix to cover every action.
- Preserve account management, auth implementation, calendar, import sources,
  monetary values, global styling, dependencies, lockfile and CI configuration.
- The first editor visit seeds eight presets idempotently; viewers only read.
- Re-fetch main before publishing, resolve any conflicts while retaining both
  features, and re-run checks when resolution changes application behavior.

## Implementation and verification sequence

1. Verify the latest main and current feature ownership; read governing docs.
2. Implement the pure normalizer and literal matching engine, with deterministic
   priority ties, manual precedence and explicit validation errors.
3. Add workspace-scoped category/rule repositories, typed form validation and
   editor-only server actions. Make override-plus-rule saves atomic. Preserve
   explicit manual Uncategorized and allow a return to automatic rules.
4. Wire the existing Transactions route, rule management and category renaming.
   Paginate at 50 rows. Handle invalid forms without writes and failed reads
   with a Transactions-only retry boundary.
5. Test domain boundaries, PostgreSQL persistence and rollback, rule limits,
   concurrency, unchanged amounts/balances, cascading deletes and authorization.
6. Test the user-facing flow in Playwright: existing and later automatic matches,
   manual corrections, rule edits/deletion, errors, roles, pagination, responsive
   dark-theme use and recovery after a failed load.
7. Run lint, formatting, strict types, full unit coverage, fresh-database
   migration checks, production build, bundle scan and the full non-external
   browser suite. Record the exact results in HANDOFF.md.
8. Commit and push the complete feature to the same PR under the user's explicit
   instruction. Rewrite the PR description around the complete implementation.

## Integration contract

The pure API is `@/features/categorization/client`; the route/server API is
`@/features/categorization`. All server callers authorize workspace access
before repository calls. Financial source metadata is distinct from manual
category provenance, and re-imports preserve existing manual choices.

Rules and overrides persist in PostgreSQL. Rule changes materialize existing
automatic category ids atomically; the read API recomputes effective automatic
categories so newly arriving transactions also match immediately. The public
`applyCategoryRules` hook materializes selected transactions after an import
commits. F-04 creation and editing call `getCategoryMetadata` inside their
existing database transaction, so categories and balance updates commit
together and edits preserve manual category choices. Import/sync features
and F-09 budgets remain their own features, with public APIs ready to use.

## Release and rollback

Merge only when the repository's required CI checks and teammate review pass.
Apply `0005_categorization.sql` before deploying application code that reads
its columns and tables. Local checks only touch the local PostgreSQL database.

If a regression appears, revert this feature's code changes, preserving unrelated
work. Keep the additive category tables/columns when reverting code to avoid
losing saved choices. Database errors do not expose raw financial data, and
failed mutation transactions leave the previous saved state intact.
