# Monthly budgets (F-09)

An allocation answers how much the user planned for a category this month.
Actual spending comes from recorded ledger activity. For example, a $500
groceries plan with $340 of purchases and a $20 grocery refund shows $320
spent and $180 remaining. Changing the allocation to $550 makes this month's
remaining amount $230 and preserves earlier months' allocations.

## Behavior and financial rules

- Current month by default, using `America/New_York` (`DEFAULT_TIME_ZONE`).
  Transaction `posted_on` is a calendar date. Workspace time-zone settings do
  not exist yet; the helper accepts an explicit zone for tests.
- Inspect months from January 2000 through next month. Only current and next
  month allocations can be edited. Saved history is read-only.
- Allocations use nonnegative integer USD cents, up to $100,000,000 per
  category. Zero is a saved allocation; absence means no budget.
- Posted activity through today counts for the current month; historical
  months cover the full month. Pending and future rows do not count.
- Read all owned accounts, including card purchases. Exclude marked
  transfers, Income, Retirement and Investing. Unmarked card payments or
  transfers still require correction in Transactions; no guessing from
  descriptions.
- A credit in a spending category reduces spending, even below zero.
  Uncategorized debits are shown separately; unknown credits are not assumed
  to be refunds. There is no available-cash or forecast claim.
- Current categorization rules and manual overrides, including explicit
  Uncategorized, determine actuals. Category renames preserve allocations.
  Changes to categorization can change historical actuals; saved allocation
  amounts remain attached to their original month.
- Copy previous month fills missing spending allocations only, preserving
  existing values including zero. It is atomic and repeatable, with no
  automatic rollover.
- Summary separates budgeted and unbudgeted spending. Uncategorized is
  visible and included in total recorded spending. Progress is bounded to
  0–100%; exact amounts still show above-plan or negative spending.

## Public API and authorization

Import through `@/features/budgets`; pure browser types/helpers are available
from `@/features/budgets/client`.

- `loadBudgets(workspaceId, month?)`: session-authorized viewer read. An editor
  visit idempotently initializes existing category presets; a viewer never
  initializes data.
- `saveBudgetAction`, `removeBudgetAction`, `copyBudgetsAction`: editor checks
  before parsing bound targets or reading financial data; safe form errors
  retain submitted amounts. Workspace IDs in form data cannot change scope.
- `readBudgetMonth(verifiedWorkspaceId, month, today)`: server-only repository
  read for trusted future consumers. A service/agent caller must authorize
  its own identity and membership before invoking this function. It does not
  perform cookie authorization and is not an external entry point.
- `BudgetsPage` and `BudgetsView`: server presentation and authorized view.

Every query and account/category join is workspace-scoped. Monthly reads use
a read-only repeatable-read transaction with ID-keyset pages of 500; above
20,000 posted rows or 1,000 categories/rules they fail into the retry boundary,
never return partial totals. No shared cache or ledger mutation is involved.
Workspace advisory locks serialize budget writes; DB constraints enforce
ownership, uniqueness and amounts. Copy and saves retain the workspace during
cascade deletion.

## Migration and release

Generated migration `0010_monthly_budgets.sql` creates only the budget table,
constraints and unique index. It does not backfill allocations or alter
accounts, transactions, categories, recurring payments or Insights data.

Before releasing the new route, identify the preview/production target and
its migration journal with `pnpm db:whoami`. Then run `pnpm db:migrate` with
the intended direct `DATABASE_URL_UNPOOLED` (or direct `DATABASE_URL`). Never
use the test database's URL for deployment. The table must exist before
deploying the new route. A missing table renders the local retry state, not
fabricated zero spending.

## Verification

Domain, repository, action and loader Vitest suites cover money, dates,
classification, persistence, concurrency, rollback, access and failure
handling. The four entry points participate in the shared isolation matrix.
`tests/e2e/budgets.spec.ts` covers full UI workflows, year navigation, readers,
outsiders, retry recovery, keyboard input, 360px layouts, themes and reduced
motion. Synthetic screenshots are under `docs/screenshots/budgets/`.

Use an isolated local/CI PostgreSQL database for all fixtures. Full import
regressions additionally require the existing Neon `storage-tests` bucket;
production storage must never be used for tests. See `docs/HANDOFF.md` for
the checks actually completed and any environmental blockers.
