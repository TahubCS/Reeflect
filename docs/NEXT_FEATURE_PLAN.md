# Next feature proposal: monthly budgets (F-09)

Approved by the user on 2026-10-11. Implemented on `feat/monthly-budgets`;
see [the feature README](../src/features/budgets/README.md) for the final
behavior, APIs and migration instructions. The review below records the
starting state and approved scope.

Reviewed against main `b852d8214c834f9278acc9c72b9eb107d8c8f17c` on
2026-10-11. Main was checked again at the end of the review and still pointed
at this commit.

## Recommendation and the problem it solves

Build the complete **Monthly budgets** feature on `feat/monthly-budgets`.
At review time F-09 was unassigned in [HANDOFF](HANDOFF.md), P1 in
[PROJECT](PROJECT.md), with a placeholder route and no budget table. It
follows Accepted ADR-015; the approved interactions are now ADR-060.

Recurring payments answers “what payments repeat?” Insights compares spending
with sample people. Budgets would answer “how much did I plan for this category,
how much have I spent this month, and how much remains?”

Example: a $500 groceries budget, $340 of purchases and a $20 grocery refund
shows **$320 spent and $180 remaining**. Changing the plan to $550 changes this
month's remaining amount to $230 while preserving previous months' budgets.
These are totals from recorded activity, not a guarantee of available cash.

The user confirmed Simon is working on dashboard integration and Jacob on
Insights and a previous year of mock activity for the team's accounts. Budgets
can develop alongside that work with a separate page and feature directory.
P0 calendar, agent and Nessie work remain the team's demo priorities under
ADR-043; this recommendation is for an independent parallel feature.

## What the review covered

Read the product priorities, architecture, decisions, assignments, recent
handoffs, testing policy and demo claims. Inspected all current feature areas,
routes, schema/migrations, public interfaces, finance calculations, agent/worker
flow, batch tooling and test/CI structure, with deeper tracing of ledger,
categorization and candidate-feature dependencies. This is a feature-planning
review, not proof that every line is defect-free.

| Area | State on the reviewed main | Implication |
|---|---|---|
| Auth and workspaces | Verified email, sessions, Personal workspaces, role checks and isolation tests exist; household flow is later | Reuse authorization boundaries; no auth redesign |
| Accounts and transactions | CRUD, signed cents, balance updates, sources and manual transfer marks exist | Budgets can read ledger facts without modifying balances |
| CSV/PDF imports | Capital One formats, preview/commit, reconciliation and deduplication exist | Consume committed rows; no parser or storage changes |
| Categorization | Rules, manual overrides including Uncategorized, renamed presets and `classifyStored` exist | Use effective categories, not stale stored automatic category IDs |
| Recurring payments | Full website and public APIs exist; user confirmed live deployment works | Existing recurring estimates remain separate from actual budget spending |
| Dashboard | Reads real activity; `toCashflowData` currently returns `recurring: []` | Upcoming-payment/payday integration belongs to Simon |
| Insights | Effective-category metrics, sample comparisons and stored batch figures exist | Jacob owns it; its rolling monthly averages are unsuitable for calendar-month budgets |
| Synthetic data | Generator and batch load/promote/rollup tooling exist | Consume Jacob's recorded mock rows; do not change his generator or accounts |
| Agent and worker | Phone linking, STOP, turn relay and fixed replies exist | Full financial replies, logging tools and proactive delivery have additional dependencies |
| Bills | Placeholder; reminders, job tick, outbound delivery and quiet-hours controls are absent | F-22 is considerably broader than displaying recurring bills |
| Budgets | Placeholder, no schema or feature implementation | Clear independent vertical feature |
| Settings and deletion | Phone controls and opt-in exist; quiet-hours settings and workspace deletion are absent; account deletion exists | Deletion has destructive consequences; quiet hours alone cannot complete reminders |
| Transfers and Nessie | Transfer fields exist, automatic pairing and Nessie client/sync do not | Financial accuracy and external-source projects need separate scope and coordination |

Main's [CI](https://github.com/TahubCS/Reeflect/actions/runs/38114406694)
and [CodeQL](https://github.com/TahubCS/Reeflect/actions/runs/38114406700)
both passed on this exact commit. CI's lint/types/docs/format, unit, security,
production build, bundle scan and browser jobs all succeeded. The review did
not rerun these tests locally. External service tests are not PR gates.

## Alternatives considered

| Candidate | Value | Dependencies / overlap | Decision |
|---|---|---|---|
| F-09 Monthly budgets | Concrete monthly limits, actual spending and remaining amounts; later supplies F-27's budget reply | One new table, own page, existing ledger/category reads; small shared registration edits | Recommend now |
| Transfer pairing (ADR-020) | Prevents card payments/internal transfers being counted as spending | Touches transaction flags, matching, unpairing and import integration; ambiguous matches need care | Strong next accuracy project; coordinate with data/dashboard owners |
| F-22 Bill reminders | Warns before due dates | Lender/user/predicted dates, payment matching, job clock, outbox, worker send, opt-in and quiet hours | Too many dependencies for the next isolated feature |
| F-23 Nessie connect/sync | Completes a P0 sponsor/demo source | New API client, mapping, deduplication, balances, bills/loans and Jacob's demo data | Prioritize at team level if missing from the demo; larger external-service scope |
| F-25/F-27/F-28 agent features | Core texting experience | Gemini/tools, exact-number handling, identity and dashboard/budget data contracts | Valuable, but coordinate with the agent owner and Simon's changing summary |
| F-12 recurring/payday integration or F-35 refinements | High product value | Directly overlaps confirmed active ownership | Leave with Simon and Jacob |

## Complete feature scope

- Replace `/w/[workspaceId]/budgets` with a working page; retain the existing
  `/budgets` redirect and navbar link.
- Default to the current calendar month. Navigate past months to inspect their
  recorded spending and saved plans; allow planning the next month.
- Set, edit and remove a budget for each spending category. A zero allocation
  is distinct from an unset budget. Show all existing category names, including
  renames, without creating another category manager.
- Show allocation, posted net spending, remaining amount and accessible
  progress for each eligible category. Show amounts above the plan in neutral
  words. Keep negative net spending when refunds exceed purchases.
- Show allocated total, spending against allocated categories, their remaining
  amount, and spending in categories without a budget. Label the scope of each
  total; unbudgeted spending must remain visible.
- Show Uncategorized spending with a link to Transactions. Income, Retirement
  and Investing are not spending budgets under the current product decisions.
- Explicitly copy the previous month's allocations into empty categories of the
  selected current/next month. Existing allocations, including zero, survive.
  Copy is atomic and repeatable; no automatic rollover or overwriting history.
- Viewer read-only mode, editor/owner controls, validation, pending/success
  states, retained form input on failure, no-data/no-budget states and a local
  retry boundary are part of delivery.
- Expose a documented authorized read path for later agent consumers; building
  the agent conversation remains its own feature.

Proposed interaction details for approval with this plan: historical months
are read-only; current and next month allocations can be edited; copying only
fills missing allocations. These details keep old plans stable and make a
repeat click safe. No fixed dollar allocations, AI-generated budgets, recurring
estimates added to actual spending, or automatic changes to a user's limits.
Historical suggestions and forecasting can be considered separately.

## Financial rules and limits

1. Use integer `Cents` and existing `lib/money` operations everywhere.
   Zero-budget and refund cases must not create invalid ratios or hide signs.
2. Group by calendar `posted_on` dates. Determine the default month/today using
   `DEFAULT_TIME_ZONE` (`America/New_York`), as current finance pages do.
   Per-workspace time-zone settings do not exist; do not add another settings
   schema under this feature. Test the time-zone helper with explicit zones.
3. Read posted activity only, through today for the current month. Past months
   cover their full calendar range. Pending and future-dated rows are not
   actual spending; future month allocations have no invented actuals.
4. Exclude `is_transfer` rows, Income, Retirement and Investing. Count card
   purchases as spending. A positive amount in a spending category is a refund
   reducing that category; a positive Uncategorized amount is not a purchase
   refund. No description-based guessing of transfers or refunds.
5. Reuse the public categorization `classifyStored` with this workspace's rules
   and manual choices. Keep stable category IDs across renames. Use the current
   spending-category definition documented by ADR-055/ADR-057 and implemented
   in Insights, without importing or refactoring Jacob's private modules.
6. Read all eligible monthly rows in a consistent snapshot, using paged reads
   and incremental aggregation. Do not use the transaction list's 200-row
   default or group stale category IDs directly in SQL. Use the existing
   workspace/date index; test query behavior with a year of mock history and a
   month spanning multiple pages. Resource limits must fail clearly rather
   than return partial totals.
7. State “based on recorded transactions.” Available rows do not prove that
   every bank or day has been imported. Empty data is not evidence of zero
   real-world spending, and totals do not assert affordability.
8. **Known upstream limitation:** imported card payments are not automatically
   paired. Marked transfers are excluded; an unmarked payment can still inflate
   spending. Explain review of transfer marks through Transactions. Do not claim
   F-09 fixes the transfer-matching feature.
9. Insights uses rolling periods ending yesterday UTC and scales to an average
   month. Budgets uses a named calendar month and includes today's posted rows.
   Raw calendar-month fixture totals must agree with the documented spending
   rules; displayed Insights averages need not equal Budgets totals.

## Implementation sequence and boundaries

1. **Start from fresh main.** Create `feat/monthly-budgets`; check the latest
   migrations and owner changes again. Record the spending rules and confirm
   the scope above before application implementation.
2. **Domain plus tests.** Add `src/features/budgets/domain/` for month/input
   validation and deterministic category totals, remaining values and display
   states. Define page data and the reusable read contract first.
3. **Persistence plus real PostgreSQL tests.** Add a dedicated `budget` schema
   module and a generated additive migration using the next available migration
   number. Store workspace/category/month/amount/timestamps, a unique
   workspace/category/month key, nonnegative bounded cents and a valid month.
   Use a composite workspace/category FK and workspace cascade deletion.
   Build scoped repositories, an atomic upsert/remove/copy, and consistent
   ledger/category/rule reads. Budget mutations never write ledger rows,
   account balances, recurring metadata or sample figures.
4. **Authorized routes and actions.** Viewer reads; editor writes. Authorize
   before touching data, validate every submitted month/category/amount,
   reject another workspace's category, and register every entry point in the
   shared isolation matrix. Seed missing presets only after editor access;
   viewers do not initialize financial data.
5. **Full UI plus browser tests.** Build the month view and all controls/states
   above with CSS Modules and existing tokens, Suspense for request data and a
   feature error boundary. Honor 360px, light/dark, keyboard operation and
   reduced motion. Read the installed Next.js guides before implementation;
   use this version's error-boundary API.
6. **Integrate and verify.** Add focused tests that consume existing public
   transaction/category APIs and imported-style rows without changing imports.
   Use a separate test workspace for the year-sized history fixture; do not
   edit the team's live mock accounts or Jacob's specs. Update docs and the
   handoff, synchronize with main again, resolve migration/registration
   conflicts, then run required checks on the resulting final branch.
7. **Review and rollout.** Present the full feature, tests, limitations and
   migration instructions together in one PR when authorized. Verify a migrated
   preview before release; apply/verify the additive production migration before
   the new application version serves traffic. Check the new page and existing
   core flows after release. No production migration or deployment is part of
   this planning session.

Most work is new files under `src/features/budgets/`, a new schema module,
the budgets route/error boundary, and `tests/e2e/budgets.spec.ts`.
Shared edits are schema exports, generated migration metadata, the isolation
test registration/fixtures and relevant docs. These can conflict if other
branches add schema or features; synchronize and regenerate pending migration
metadata from the final main rather than editing an already-applied migration.
No dashboard, Insights, generator, parser, worker or global CSS redesign is
needed. If an implementation reveals a necessary cross-feature change, surface
it and coordinate scope before making it.

## Required verification and acceptance

| Layer | Required evidence |
|---|---|
| Domain | Month-end/time-zone/DST/leap-year boundaries; mid-month edits; purchases and category refunds; excess refunds; transfers/card payments; card purchases; Income/saving exclusions; Uncategorized/manual overrides; zero/unset allocations; above-plan and safe-integer boundaries; totals sum correctly |
| PostgreSQL | Two-workspace isolation and foreign-category rejection; viewer writes blocked; unique repeated/concurrent saves; atomic copy and rollback; copy preserves existing values; remove/re-add; cascades; category renames/rule changes; all pages counted; consistent reads; fresh and existing-database migrations |
| Browser | Set/edit/remove/copy, reload persistence, previous/current/next month, unchanged prior budget after current edit, correct refund totals, live ledger edits reflected on reload, no-budget/no-data/uncategorized states, invalid input, viewer/outsider access, failure/retry without fake zero data, 360px and both themes, accessible labels and keyboard/reduced-motion behavior |
| Regression | Existing accounts/transactions/import/categorization/recurring/calendar/Insights/phone-link flows stay green; budget mutations leave their financial rows and balances unchanged |
| Release | `pnpm lint`, `format:check`, `typecheck`, `docs:check`, full `test:unit`, production `build`, `scan:bundle`, and non-external `test:e2e`; green PR CI and CodeQL; correct preview/production database migration identity before release |

Use local/CI PostgreSQL and synthetic fixtures. Existing import/storage
regressions still require the isolated Neon `storage-tests` bucket. If this
workspace's network policy blocks that bucket again, report local verification
as blocked and use the real successful CI results for those checks; do not skip
tests or claim an incomplete local run passed.

The feature is complete only when the page, persistence, permissions, edge cases,
tests and rollout instructions are reviewable together. An engine-only PR is
not the target.

## Confidence and remaining risks

High confidence that this scope can be delivered end to end: the data,
categorization, authorization and money foundations already exist, and no new
external service is required. Expected code overlap is low with the owners the
user identified. Shared schema/test/docs files still need normal merge handling.

Runtime risk is reduced by an isolated route, additive schema, bounded reads,
safe action errors and a local retry boundary. Accuracy still depends on imported
coverage, current category rules and marked transfers. CI is evidence for tested
behavior, not a guarantee that an app can never fail. Confirming the correct
database and migration before deployment is an explicit release gate following
the recurring page's production migration incident.
