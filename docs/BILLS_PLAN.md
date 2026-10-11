# Complete Bills page: web-only implementation plan

Revised October 11, 2026, following the user's instruction to complete only
the Bills website experience and leave all iMessage work to Claude. This
replaces the earlier proposal that included calendar changes and message delivery.
Implementation approved by the user. The web page and migration are implemented
on `feat/bills`; final verification and deployment migration are recorded in HANDOFF.

Initially reviewed against main `ed5e1958d5d23bddad368e5dd6ba927b89cf37bd`
(PR #29), including Simon's planned transactions and migration `0013`.
Its [CodeQL](https://github.com/TahubCS/Reeflect/actions/runs/38125302982) passed;
[CI](https://github.com/TahubCS/Reeflect/actions/runs/38125303012) was still
running at review time. The preceding main `516a5b6` passed both checks.
These are baseline results, not tests of an implementation that already exists.

## 1. Scope and team boundaries

Bills is the only navbar route that is entirely a placeholder on this main.
Other tabs have working implementations; some capabilities, including Settings
quiet hours/deletion and bank integrations, remain unfinished. This project
does not expand into those capabilities.

The deliverable is a complete usable Bills page at
`/w/[workspaceId]/bills`, including persisted data, forms, payment tracking,
history, authorization, error handling and tests. The existing `/bills`
redirect and navbar link remain valid.

Claude owns iMessage. Simon owns Dashboard integration. Jacob owns Insights
and the shared developer-account mock data. This work does not modify their
feature implementations or populate their accounts.

| In this implementation | Outside this implementation |
|---|---|
| Bills list, detail, add/edit forms and history | Agent turns, tools, prompts and AI clients |
| Current invoice amounts and explicit due dates | iMessage conversations, linking and commands |
| Posted-payment evidence and reversible user marks | Worker, protocol, sender and message delivery |
| Bills-page due-soon notices and filters | Schedulers, job ticks, cron and outbound queues |
| Account-specific recorded-cash comparison | Dashboard/calendar calculations or integration |
| Autopay annotation and tracking lifecycle | Quiet hours, notification preferences and STOP |
| Additive Bills persistence and migrations | Import parsers, Insights, Budgets or sample generation |

This completes the agreed **web Bills page**. F-22's broader iMessage delivery
and dashboard reminder integration remain separately owned. The web page has
no dependency on a running agent, messaging credentials or a scheduler.

## 2. What the page helps the user understand

Recurring payments explains what repeats and its usual cost. Bills explains
the current obligation: when it is due, what this invoice requires, what
payment evidence exists and what remains.

For example, electricity usually costs $145. The user enters this month's
invoice as $184 due October 25 and links a posted $100 payment. Bills shows
$84 remaining. This invoice does not overwrite next month's historical
estimate, create a transaction or adjust an account balance.

The complete page includes:

- **Upcoming:** confirmed active bills, due/expected dates, actual invoice or
  clearly labelled estimate, payment account, autopay annotation and status.
  Due today and explicitly unresolved invoices remain visible.
- **Due soon:** a Bills-page notice/filter for open bills within seven local
  days, computed when the page loads. No message or background reminder job.
- **Needs review:** uncertain dates, missing invoice amounts, suggested
  patterns and payment candidates. Suggestions need confirmation before
  becoming tracked obligations.
- **Bill detail:** cadence, evidence, current invoice editing, linked payments,
  remaining amount and bounded cycle history.
- **Add/edit:** manually track rent, utilities, insurance and debt payments
  without waiting for three historical charges. Support fixed/variable costs
  and the cadence supported by the existing recurring feature.
- **Payment controls:** link/unlink posted evidence, show partial payments,
  mark paid by the user and undo that mark. Autopay alone never means paid.
- **Tracking controls:** stop tracking and restore through existing recurring
  lifecycle APIs, preserving available cycle history. Restored detected
  patterns still require confirmation under the current recurring rules.
- **Filters and states:** account/status/date range, bounded history pagination,
  useful empty/loading/error/retry states, inline validation and viewer mode.

Use responsive CSS Modules and existing design tokens, keyboard-accessible
forms, readable status text and light/dark themes. No new styling framework.

## 3. Data and payment rules

Retain ADR-058's pattern-based detection and existing user corrections.
Do not introduce a new detector, a merchant allow-list or fixed amount rules.
Record web-specific cycle/payment decisions in a new ADR from the owner's
reserved block in ADR-063; leave accepted decisions unchanged.

1. **Date certainty:** an observed payment date is an expected date, not
   evidence of a lender deadline. Explicit invoice due dates say 'Due';
   predictions say 'Expected around'. Confirm existing recurring payment
   dates as due dates where needed. A past prediction without evidence
   says 'Payment not confirmed', rather than asserting lender delinquency.
2. **Stable cycles:** retain the original monthly due-day anchor so January
   31 becomes February 28/29 and then March 31. A due-date edit changes
   the existing cycle instead of creating another obligation. Use the
   application's current America/New_York date boundary consistently.
3. **Invoice amounts:** this cycle's amount is separate from the recurring
   estimate. Explicit zero means no payment due; missing invoice amount
   means unknown, with a labelled typical amount/range when available.
4. **Payment evidence:** suggestions are review hints. Only a user-confirmed
   posted transaction or an explicit user mark establishes the web page's
   payment state. Match the owned account/payee and cycle; do not silently
   allocate a transaction to two cycles. Pending/future rows and unrelated
   refunds do not settle an invoice.
5. **Partial payments:** compute remaining cents from the invoice and valid
   linked evidence. User-marked payment is labelled separately from posted
   evidence. Changed/deleted evidence returns the invoice to review; an
   old copied total must not keep a bill falsely settled.
6. **Debt/autopay:** users can enter a card minimum or loan payment and
   identify an existing liability account. Do not invent minimums from
   balances or interest rates. Explicitly linked outgoing repayment
   transfers can be payment evidence without becoming spending or income.
   An autopay label is an annotation, not verification of payment.
7. **Cash comparison:** compare open cash obligations due within the next
   30 days plus explicitly unresolved past invoices against recorded
   checking/savings balances, with balance-as-of dates visible.
   Show account-specific coverage; card-charged purchases do not directly
   consume liquid cash. Separate known invoice totals from estimates, and
   show unavailable data explicitly. Label this as cash versus bills, since
   it excludes everyday spending and one-off plans; it is not a safe-to-spend
   headline. Do not claim a payment will succeed.
8. **Read-only finances:** Bills actions never submit a payment, create or
   edit ledger transactions, reclassify transfers, adjust balances or change
   budget/Insights totals. Only bill metadata and user tracking choices change.

The current reminder-matching/delivery policy belongs to Claude's work.
This plan does not change ADR-030's automated reminder amount rule, message
eligibility or notification semantics. If the agent later consumes these web
invoice facts, that integration must explicitly agree on their meaning.

## 4. Reuse and the smallest shared changes

Use `src/features/bills/{domain,server,ui}` with public `index.ts` and a pure
`client.ts` entry point. Reuse recurring public repository functions and
pure types, account APIs, money utilities and authorization helpers.
Do not import another feature's private server or UI modules.

Keep `recurring_series` as the canonical schedule and long-term estimate.
Existing confirmed bills appear without a write or backfill on page load.
Cycle-specific facts live separately; pure bounded projections are read-only.
Do not infer years of unpaid invoices from historical charge predictions.
Simon's new `planned_transaction` records remain separate. Bills does not
convert them into recurring obligations, confirm them or count them as
payment evidence; only posted ledger rows qualify for payment linkage.

Proposed new records, finalized during schema review:

| Record | Purpose and constraints |
|---|---|
| `bill_details` | One-to-one metadata for the existing workspace/account/payee: due-day anchor, explicit due-date provenance, autopay and optional owned payment/liability account references |
| `bill_cycle` | Stable owned cycle key, due date/source, invoice amount/source, estimate snapshot where necessary, reversible user-marked payment and revision; unique identity survives date edits |
| `bill_payment` | Explicit cycle-to-owned-transaction linkage, unique allocation and sufficient evidence revision to detect changed/deleted payments; current posted facts remain authoritative |

Use the existing unique `(workspace_id, financial_account_id, merchant_normalized)`
series identity for linkage, avoiding changes to the public `Payment` shape.
Composite ownership constraints protect accounts, series, cycles and payment
evidence. Add only the minimal transaction ownership index if a composite
foreign key needs it. Define deletion behavior to preserve a review signal
when evidence disappears, while still respecting workspace/account deletion.

A manual bill plus its metadata must save atomically. The current recurring
`savePayment` starts its own locked transaction; its UI actions redirect to
Recurring payments. Do not nest that operation inside a second locked Bills
transaction or reuse its redirecting UI action.

Implement a small additive **server-only transaction composition API** in
the recurring repository/public entry point if needed. Extract the existing
validated save operation for reuse inside the same owned, locked database
transaction; keep existing `savePayment` signatures, results and behavior
unchanged. Bills actions provide Bills redirects and write their metadata
in that transaction. Rollback and existing recurring regression tests must
verify this shared change. Invoice-only edits remain inside Bills.

All actions authorize before data access: viewers read, editors write.
Queries filter the verified workspace; client code never imports the DB.
Validate inputs with Zod, keep money in branded integer cents and avoid
shared caches of financial data. Use revision checks/constraints so stale
forms and duplicate clicks cannot overwrite another edit or duplicate a cycle.

## 5. File boundaries and avoiding team conflicts

| Paths | Planned treatment |
|---|---|
| `src/features/bills/**` | New isolated feature and tests; primary implementation |
| `src/app/(app)/w/[workspaceId]/bills/**` | Replace placeholder and add only Bills-owned routes/loading/error states |
| `src/lib/db/schema/bills.ts`, schema barrel and generated migrations | Additive Bills tables/exports; no messaging tables or columns |
| `src/lib/db/schema/finance.ts` | Only an ownership index if required by evidence FK; no ledger behavior change |
| Recurring repository/public entry point and focused tests | Small additive atomic-write API only; preserve detection, public reads and existing callers |
| Bills E2E fixtures/specs and docs | New isolated test data, plan/ADR/feature documentation and handoff entries |

**Excluded from the diff:** `src/features/agent/**`,
`src/features/messaging/**`, `agent-worker/**`, `packages/agent-protocol/**`,
`src/lib/ai/**`, agent routes, job routes, `src/features/reminders/**`,
messaging schema, notification preferences and service-token/environment setup.
Also leave `src/features/cashflow/**`, Dashboard routes, Insights, import
parsers, budgets, `src/features/plans/**`, developer mock-data generation and
global Settings unchanged.

Bills-specific due/amount/payment corrections therefore do not alter Simon's
existing calendar projections. Bills labels its invoice facts and the recurring
view retains its current estimates. A documented Bills public read API gives
Simon and Claude a later integration option without making that integration
part of this implementation. Do not claim app-wide invoice synchronization.

Start implementation on `feat/bills` from freshly fetched main. Before
migration generation, before publishing and after CI, fetch main again and
resolve conflicts. Recheck migration journal order/timestamps and reserved
ADR/handoff numbers. Audit the final changed-path list against the exclusions.
Keep package scripts, lockfiles, shared CSS and CI configuration unchanged
unless a concrete Bills requirement makes a change necessary.

Git cannot reveal Claude's or teammates' unpushed edits. This plan minimizes
overlap and requires checking it; it cannot promise zero future conflicts.

## 6. Implementation stages

| Stage | Work and acceptance gate |
|---|---|
| 1. Establish the boundary | Fresh-main baseline; record the approved web rules and exact shared files. Confirm no agent paths are needed. |
| 2. Domain and persistence | Cycle dates, invoice/payment states and cash comparison; additive tables and the narrow atomic recurring adapter. Unit and real-PostgreSQL tests pass before connecting forms. |
| 3. Complete the page | Bills list/detail/history, manual add/edit, pattern confirmation, payment link/unlink, mark/undo, autopay, tracking controls, filters and all page/save failure states. |
| 4. Verify the whole flow | Production-build Playwright journey, viewer/cross-workspace tests, main's required regression checks, accessibility/mobile and final path audit. |
| 5. Migrate and release | Reconcile latest main; run and verify migrations on the selected target, prepare a reviewable full-feature PR, then smoke-test the deployed Bills page after merge/deployment. |

Stages are checkpoints of one complete web feature. Delivery is not limited
to an engine or a form; payment tracking, persistence, browser coverage and
migration verification are part of the final result.

## 7. Tests that establish confidence

- **Domain:** fixed rent, variable electricity, current invoice versus future
  estimate, leap-year/month-end schedules, due today, past predicted versus
  explicit due dates, zero/unknown amounts, partial payment, overpayment,
  manual mark/undo and liability transfers excluded from spending.
- **PostgreSQL:** owned foreign keys, cross-workspace rejection, atomic
  rollback, concurrent saves, duplicate payment allocation, stale form
  rejection, changed/deleted evidence and history after stop/restore.
- **Upgrade:** migrate a populated database from current main; compare
  existing ledger rows, balances, recurring preferences and budget data
  before/after. Apply again to verify idempotence. Confirm generated
  migration timestamps follow main's checkpoint so the new tables are
  actually created, addressing the earlier budgets rollout failure.
- **Browser:** create a bill, correct this month's invoice, link a partial
  posted payment, verify remaining amount, mark/undo, browse history, stop/
  restore tracking and refresh. Test viewer restrictions, invalid input,
  empty data, server failure/retry and narrow mobile layouts.
- **Existing app:** run the repository-required lint, docs, typecheck, unit,
  production build, bundle scan and E2E checks. Recurring CRUD/detection,
  imports, account activity, budgets and calendar behavior must stay green.
  If a required external-storage check is blocked, report it explicitly
  rather than describing the full suite as passed.

New Bills tests do not send iMessages, invoke the agent or write real users'
mock data. Use isolated synthetic fixtures and the local test database;
existing agent tests still run as part of the repository regression suite.

## 8. Migration and deployment verification

The user has already requested `pnpm db:migrate` after all changes if new
migrations exist. Honor that during implementation; do not run a migration
as part of this planning-only session.

1. Generate additive migrations from the finalized schema, after reconciling
   current main. Never renumber/rewrite an already applied migration.
2. Pass local upgrade, fresh-database, repeat-run and data-preservation tests.
3. Use the existing target-identification tooling to verify the configured
   database is the intended one; never print secrets or use ad-hoc SQL patches.
4. Run `pnpm db:migrate` once implementation is complete on that verified
   target. Check actual tables/constraints and journal entries afterward;
   a successful command alone is not proof the schema changed.
5. Check that the application deployment uses that same database/branch.
   Apply the additive schema before the new code receives production traffic.
6. After deployment, check the authenticated Bills page and one reversible
   save/edit using an authorized test workspace, plus existing navbar routes.

If database access is unavailable, finish independent implementation/testing
and report the migration step as blocked. Do not claim production readiness
or silently apply the change to a different branch.

## 9. Completion and risk assessment

The work is complete when the live web page supports the full journey above,
persists changes across reloads, respects workspace roles, passes the relevant
checks and has verified schema on the deployment's actual database.

This is a bounded, feasible web feature with substantially less shared work
than the earlier full reminder-delivery proposal. Main changes are concentrated
in a new Bills folder, new schema and the Bills route. The meaningful risks
are atomic recurring writes, ownership of payment evidence, date/cycle edge
cases and migration checkpoint ordering; each has a specific validation gate.

Do not promise that a feature can never crash. Confidence should come from
passing domain, PostgreSQL and production-build browser tests, a reviewed
diff and a verified deployment. No iMessage implementation is required.

Status: web implementation and local verification complete; publication
authorized. Production migration and Neon storage verification remain pending.

## Implementation verification (October 11)

Implemented on `feat/bills`, updated to main `66552da`, with ADR-063 and migration
0014. See HO-066 for the complete verification and remaining deployment work.
Domain/database/action/isolation tests and six Bills browser flows pass, as do
104 locally runnable browser regressions and 1,736 unit regressions with coverage.
The populated upgrade and repeat migration preserve existing financial records.
The final `pnpm db:migrate` succeeded locally. Production migration and the
existing Neon storage suites await a fresh runtime applying the saved network
rules; they are not claimed verified. Agent and dashboard integrations remain
outside this feature.
