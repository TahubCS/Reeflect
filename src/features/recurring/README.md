# Recurring payments (F-10)

Recurring payments cover subscriptions, rent and bills whose amounts change.
**Look for patterns in actual payment dates, rather than fixed weekly/monthly
windows or an amount band.** [ADR-058](../../../docs/DECISIONS.md#adr-058-recurring-payments-from-observed-patterns-with-user-confirmation)
supersedes ADR-014 with the user's approved scope. Kind (`bill`/`subscription`)
and amount behavior (`fixed`/`variable`) are independent user choices.

The full website lives at `/w/[workspaceId]/subscriptions`, keeping existing
links working under the **Recurring payments** navigation label. Suggestions
need confirmation before contributing to cost estimates. Editors can add a
payment without history, correct it, dismiss/restore it, and save subscription
Keep/planning-to-cancel choices. Filters cover kind, account, tracking state and
intent; cards paginate at 20 while totals cover the whole workspace.

## How inference works

1. Read posted transactions in the workspace over the latest 1,096 days
   (about three years), paged by ID. Group eligible outflows by account and
   `normalizeMerchant` from categorization's pure public entry point. Exact
   normalized payees match; separate accounts never share evidence.
2. Require three charges. Inspect the latest six dates. Learn the median gap
   and compare deviation to that observed interval. Reject duplicate-day
   ambiguity, intervals shorter than four days, median absolute deviation over
   20% of the interval, or any deviation over 35%. A gap since the last charge
   exceeding two observed intervals makes the pattern inactive.
3. When the observed dates have a consistent positive calendar-month spacing
   and an approximate common day, infer a calendar-month schedule. Day residuals
   may be at most the larger of two days or 10% of the learned interval. Otherwise
   use the rounded learned day interval. Labels such as Monthly, Quarterly,
   Weekly and Every two weeks describe the result; they do not determine whether
   a pattern qualifies. Short months clamp dates to their last day.
4. Amount changes **never reject a timing pattern**. The latest three outflows
   give a median, range and sample count. Equal observed amounts default to
   fixed; otherwise variable. Housing/utilities/transport preset category keys
   suggest Bill; otherwise Subscription is an initial suggestion. Users correct
   both properties. No merchant allowlist or AI model decides the pattern.
5. Show up to twelve supporting charges with dates and sources. All suggestions,
   including stable subscriptions, require user confirmation. Saved unconfirmed
   suggestions use fresh inference; confirmed user choices survive refreshes.

These numeric limits are documented confidence and resource guardrails, not
fixed constructs declaring what counts as a subscription. Three regular grocery
trips could still be a false positive. Missing cycles, descriptions that change,
several services hidden under one payment processor, and multiple same-day
charges can prevent reliable inference. Detection deliberately leaves ambiguous
history for manual tracking and does not claim a probability or certainty.

Blank payees, normalized names over 500 characters and raw descriptions over
2,000 characters are not analyzed; descriptions are not truncated into a match.
Inputs are bounded at 20,000 posted non-transfer rows in the history window and
1,000 saved series per workspace. A charge/entered estimate is limited to
10,000,000,000 cents ($100 million), keeping even 1,000 daily annual estimates
within safe integer arithmetic. Exceeding the analysis bound shows the page's
retry state; it never silently computes totals from a partial history. Exceeding
the saved-series bound returns an error before a refresh writes anything.

## Actual activity and estimates

- Evidence uses posted negative outflows only. Pending/future rows, zero amounts,
  positive credits and identified transfers do not establish a pattern.
- Actual recurring spending this month sums matching posted charges **minus
  matching credits**, including refunds, for confirmed payments. It can be
  negative when credits exceed charges. It is not total spending on the account.
  Month/today use the existing `America/New_York` default; workspace timezone
  configuration is a later feature.
- Confirmed active payments contribute to estimated recurring costs. Calendar
  schedules annualize by `12 / months`; day schedules by `365 / days`. Monthly
  equivalents divide the rounded yearly estimate by twelve. All arithmetic and
  half-up cents rounding use `@/lib/money`. Weekly annual estimates therefore
  use `365 / 7`, not a claim of exactly 52 charges.
- Variable estimates use the recent median. Fixed estimates use the latest
  charge. An explicit user amount overrides either; “Use recent charges to update
  the estimate” chooses history, with the entered amount as a fallback. This
  choice persists independently of kind or amount behavior.
- A confirmed fixed payment flags any latest amount differing from its saved
  baseline. This invites reviewing evidence; it is not proof of a vendor price
  increase. Normal variable fluctuations do not get that flag.
- Predicted dates say **Expected next charge**. User dates say **Next date entered
  by you**. A past user date stays visible until a matching charge on or after it
  rolls the schedule forward. Missing evidence has no invented “today” prediction.
  These dates are not lender-verified due dates or proof of payment.
- Stale detected payments retain user choices and actual activity but leave active
  estimates. Manual/corrected schedules stay tracked until dismissed. Planning
  to cancel contributes potential annual savings for subscriptions while current
  cost estimates continue to include the payment.
- Removing manual tracking keeps a dismissal record so an import cannot recreate
  it. Restore returns manual payments to tracking and detected payments to a
  suggestion needing confirmation. Neither action deletes financial history.

## Public APIs and import contract

Server/route callers use `@/features/recurring`; pure/client callers use
`@/features/recurring/client`. No other feature should import internals.

| API | Behavior |
|---|---|
| `listRecurringPayments(verifiedWorkspaceId, now?)` | Read-only, consistent PG snapshot; returns current payments, workspace summary, accounts and today's date. Does not materialize suggestions, including for viewers |
| `listSubscriptions(verifiedWorkspaceId, now?)` | Confirmed active subscriptions only, for future agent consumers |
| `refreshRecurringSeries(verifiedWorkspaceId, accountIds?, now?)` | Atomically materialize new suggestions and update observed metadata. Empty account list is a no-op; never overwrites user choices |
| `confirmPattern(verifiedWorkspaceId, accountId, normalizedPayee, now?)` | Recheck current evidence before confirmation |
| `savePayment(verifiedWorkspaceId, input, editing?)` | Validate and save manual tracking/corrections; account/payee identity is fixed while editing |
| `setPaymentIntent(verifiedWorkspaceId, accountId, normalizedPayee, intent)` | Save `none`, `keep` or `cancel` on a confirmed subscription |
| `setPaymentDisposition(verifiedWorkspaceId, accountId, normalizedPayee, disposition, now?)` | Dismiss, restore, or remove tracking |

**Callers must authorize the workspace first.** Read APIs require viewer access;
write APIs require editor access. The six public server actions do this before
input validation, and all join the common workspace-isolation matrix. Every SQL
query scopes the workspace; a composite foreign key rejects cross-workspace
accounts. Writes use a per-workspace advisory transaction lock and a unique
workspace/account/payee key. Database errors return safe retry text to forms,
retaining input; the page has its own retry boundary.

For an importer: authorize workspace, commit ledger rows, classify categories and
transfers, then call `refreshRecurringSeries` for the affected accounts. Catch and
retry a post-commit detection failure; do not undo or label a successful financial
import as failed. A non-`ok` result also needs handling. No existing importer code
was changed by this feature. Reads reevaluate the current ledger, so imported and
manual transactions appear without this optional hook. Simon's current CSV/PDF imports
does not yet categorize or pair transfers: raw transfers that have not been marked
cannot be recognized as transfers by this detector.

Migration **0009_recurring_payments** follows main's 0008_insight_sample. It adds
only recurring metadata and an account ownership index. That index precedes its
dependent foreign key in the SQL. Apply migrations before running the feature.

F-22 reminder scheduling, F-26 proactive iMessage alerts, lender provenance and
live-data calendar integration remain separate work. This feature supplies APIs
for those callers; it does not send messages or create ledger transactions.

## Verification

Domain tests exercise timing/amount evidence, dates, bounds, actuals and estimates.
Real PostgreSQL tests exercise idempotence, concurrency, rollback, limits,
ownership, cascades and persistence. Action tests plus the shared authorization
matrix exercise all six writes. `tests/e2e/recurring.spec.ts` covers the complete
website flow, read-only access, pagination, invalid input and mobile layouts.
`server/import-integration.test.ts` runs both importers' real public preview and
commit actions, parsers and PostgreSQL writes, then verifies current patterns
and unchanged financial facts after confirmation/refresh. Only the session and
external object transport are faked there; main's separate Neon storage tests
still require the `storage-tests` endpoint and credentials.
Run the checks in `AGENTS.md`; final results and migration checks are in the
latest recurring-payment entry in [HANDOFF](../../../docs/HANDOFF.md).
