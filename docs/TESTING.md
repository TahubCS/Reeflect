# TESTING

How this codebase is tested. Governed by ADR-023. A change is not done until
the tests described here exist and pass in CI.

A note on scope: tests prove the app behaves as designed. They do not by
themselves make the app "enterprise-certified"; formal security assurance
comes from audits and penetration tests, which are outside the hackathon.
The aim here is to build to the standard those audits expect.

---

## TEST-01: Tools

| Tool | Used for |
|---|---|
| Vitest | Unit tests (pure domain logic, `lib/money`) and integration tests (repositories against a real PostgreSQL) |
| fast-check | Property-based tests for money and budget math |
| Playwright | End-to-end tests in a real browser against a production build |
| @axe-core/playwright | Automated accessibility checks inside E2E tests |
| PostgreSQL in Docker / CI service | Integration and E2E database |

fast-check and `@axe-core/playwright` are not installed yet. Add each with
`pnpm add -D` in the PR that writes the first test using it.

## TEST-02: Equal weight rule

Every feature ships with **both**:
- Vitest tests for its domain logic and server functions, and
- Playwright tests for its user-facing flow.

This is equal importance, not equal counts. A pull request that adds a
feature without both is not mergeable.

## TEST-03: Coverage thresholds (enforced by `pnpm test:unit`)

| Path | Lines | Branches |
|---|---|---|
| `src/lib/money/**` | 100% | 100% |
| `src/features/*/domain/**` | 95% | 90% |
| `src/lib/security/**`, `src/lib/auth/**` | 95% | 90% |
| Everything else | 80% | 70% |

Coverage is measured over `src/` and `scripts/`, with these exceptions:
- `src/app/**` and `src/features/*/ui/**`: routes are thin, and React
  components are covered by Playwright (TEST-02, TEST-07).
- Command-line entry files (`scripts/batch/cli.ts`,
  `scripts/db/migrate-to.ts`, `scripts/register-paths.ts`): they only parse
  arguments and print around tested modules, and are checked by running
  them.
- `src/lib/db/schema/**` (declarations; `auth.test.ts` checks the auth
  tables against Better Auth) and `src/instrumentation.ts`.

`vitest.config.mts` holds the same list; change both together.

Coverage is a floor, not the goal. Boundary cases below are required even
when coverage is already met.

The categorization batch regression checks that a rule list is validated once
for 20,000 rows and that saved rules, built-in rules and manual categories keep
their results. Different and invalid lists are checked independently. Unit CI
does not enforce a wall-clock deadline on shared runners. To measure the same
20,000-row workload without coverage instrumentation or a fixed time limit:

```sh
pnpm exec node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-paths.ts tests/benchmarks/categorization.bench.ts
```

The opt-in benchmark prints five timings after warm-up; it uses synthetic data
and never connects to a database.

## TEST-04: Required unit tests by area

| Area | Must cover |
|---|---|
| `lib/money` | Parsing "$1,234.56", "(12.00)", "-12", "12.5" (→ 1250 cents); rejecting non-USD and malformed input; rounding half to even; splitting without losing cents (e.g. $10.00 / 3); formatting negatives; `Number.isSafeInteger` enforcement |
| Money properties (fast-check) | Sum of category spending equals total spending; splitting then summing returns the original; add/subtract are inverse; no operation produces a non-integer |
| Cash flow (`src/features/cashflow/domain`, ADR-042) | Per-day amount with balance above, equal to and below what is due before payday (never negative); payday tomorrow (N = 1) and no expected income; repeating items clamped to the last day of short months; a month's end balance equals its start plus its items; later months carry the earlier months' balance; a no-spend day needs nothing going out; yearly subscription cost and saving; every number shown has a text label |
| Transfer review (ADR-066) | Calendar boundaries, safe opposite cents, explicit choice/confirmation, immutable expected states and legacy group validity. Real PG: metadata-only snapshots, rollback, duplicate/competing confirmation, edit/delete races, scoped orphans, Bills evidence races and unchanged labelled debt evidence. Test actual Budgets, Insights, recurring and daily cashflow results through pair/detach/reclassification. All six read/write entries join the isolation matrix |
| Web Bills (ADR-063) | Stable monthly/day anchors; bounded projections without invented overdue history; explicit due/expected provenance; zero vs unknown invoice; variable amounts; partial/full/overpayment; manual marks; edited/deleted/pending/future/refund evidence; repayment transfers; integer cash coverage; validation and pagination |
| Budgets | Calendar month boundaries and DST in the app's zone; leap years and year navigation; mid-month edits; posted/current-day cutoff; refunds including negative net spending; marked transfers, income and saving excluded; unknown credits not treated as refunds; zero vs unset; bounded progress; immutable paged reductions and integer overflow |
| Categorization | Rule priority and deterministic ties; `contains` / `starts_with` / `exact`; merchant normalization (store numbers, reference codes); manual override including Uncategorized beats rules; form validation and limits |
| Recurring (ADR-058) | Infer monthly, quarterly, yearly, fortnightly and arbitrary intervals from observed timing, including month ends and jitter. Variable utilities qualify without an amount band; irregular shopping, duplicate-day ambiguity, stale evidence, transfers, pending/future/positive rows do not. All suggestions require confirmation. Median/range, cents rounding, fixed price changes, matching credits in actual spending, preserved estimate sources, manual tracking, stale/deleted history, immutable inputs and bounds. Real PG: concurrent/idempotent refresh, atomic rollback/limits, owned account FK, cascades, saved corrections/dismissals/intent and paged history. All six actions join the isolation matrix |
| Transfers (ADR-020) | Checking → card payment pairs and is excluded from spending; same amount but more than 3 days apart does not pair; two candidates for one transaction pairs only once; unpairing |
| Import guardrails (ADR-010) | Each check in the ADR-010 table passes and fails; nothing written when any blocking check fails; duplicate file; overlapping periods dedupe; reconciliation off by $0.01 blocks |
| CSV parsing (ADR-054) | Each sign convention (360 Debit/Credit type, card Debit/Credit columns); date formats; row order from the balance chain; trailing blank lines; quoted commas and quotes; UTF-8 BOM; LF and CRLF; wrong account and multi-account exports; other banks fail clearly. Fixtures in `tests/fixtures/csv/` |
| PDF parsing (ADR-044) | Each supported template against fixture PDFs; encrypted PDF rejected; image-only PDF rejected; wrong-bank PDF blocked by identity check |
| Nessie mapping (ADR-033) | `fromDollarNumber`: 12.1 → 1210, 0.1 + 0.2 style inputs, 19.999 rejected, negative and zero amounts; purchase on a credit-card account is negative; deposit positive; transfer pairs; bill → `recurring_series` kind `bill` with lender due date; loan → `liability`; re-sync creates no duplicates (external id) |
| Nessie client | API key never appears in thrown errors or log output (spy on logger with a failing request); every purchase, deposit, withdrawal and transfer is sent with `status`; dates that are not real `YYYY-MM-DD` days are rejected before sending; amounts with cents are rejected for everything except bills; a 400 on one account's list skips that account only (ADR-048) |
| Synthetic generator (ADR-049) | Same spec and seed give identical rows, and a different seed gives different rows; extending the span leaves earlier months unchanged; nothing after `asOf`; weekend paydays move to Friday; yearly charges only in their month; every transfer is an equal and opposite pair on two accounts on one day; card full, minimum ($25 floor) and fixed payments; interest only on carried balances; closing balance = opening + rows; whole-dollar mode emits no cents and no zeros; spec validation rejects bad input with readable paths; plausibility warnings fire |
| Database targets (ADR-049) | Endpoint ids parsed from pooled and direct URLs; passwords never printed; a branch URL that is really production is refused; production refused without a matching `NEON_PRODUCTION_ENDPOINT_ID`; migrations compared with the journal (applied, pending, unknown) |
| Agent intent parsing (ADR-035) | "12 lunch", "$12.50 coffee", "lunch 12", "spent twelve dollars" (asks instead of guessing), two numbers in one message (asks), LINK codes, STOP, keep / cancel / yes |
| Logging by text (F-27, ADR-064) | `parseLog` over a table of texts: every accepted way to write an amount; every case that is asked about and not saved (no amount, in words, nothing to call it, several amounts, too many decimals, "2k", over the limit, zero, another currency, money in, another day); typos in the verb and the thing; questions, habits, times, dates, counts and phone numbers are never spending; gibberish; UNDO and its typos. `chooseAccount`: one account, nickname, kind, none or several of a kind, two with one name, a loan, none at all, and a matching word inside the description left alone. Against the database: one `text` transaction with the right account, day, sign and words; the balance moves on a hand-entered account and not on an imported one; the same message twice saves once; the model is asked only when the rules find none, sees no amount, and an answer off the list leaves it uncategorized; the budget line equals the Budgets code's figure and is left out when used up; UNDO removes only the latest text row within a day, restores the balance, and never a website row or another workspace's; the daily limit; a failed save says nothing was logged; an unlinked phone writes nothing. The open question (ADR-065): `readAccountAnswer` over a table of replies (a listed number, a name with or without filler and punctuation, a kind they have one of; a kind they have two of or a number off the list is asked again; questions, new spending and numbers written as money are not answers); every example a reply gives parses back to a log; against the database: the remembered spending is saved once on the account answered, on the day first texted; it expires after 10 minutes; only the latest question is kept; a deleted account is not used; another phone or workspace cannot answer it; the daily limit still applies; new spending, UNDO and STOP close it |
| Agent number rule | `logSpending` rejects amounts not present in the user's text; every reply passes the digit scan; a draft with a digit, an unknown label or a stray brace gives the code-built reply; what is sent to the model holds no figure from the person's data; the code-built reply obeys the same rules |
| Agent and calendar agree (ADR-059, ADR-042) | For a workspace with a confirmed payday and bills, the agent's balance, amount due before payday, amount left and per-day figure equal `summarize(loadCashflowData(...))`, the call the dashboard makes; a bill after payday is not counted; bills that use all of the balance give no per-day figure; no confirmed payday gives no payday labels and counts the suggestions waiting; one workspace never gets another's payday; counts carry their noun in singular and plural; these labels are exact and need no "a month" |
| Agent questions (F-28, ADR-059) | For a workspace with budgets and spending just logged by text, the agent's category figures (spent, budget, left or over) and the month's total equal `readBudgetMonth`'s; the upcoming payments equal `summarize`'s, soonest first with written-out dates; each account's balance equals the stored one, a card's as what is owed; at most 12 categories, 3 payments and 6 accounts; a failed budget read leaves the category labels out and still answers; one workspace never gets another's categories, payments or accounts; what is sent to the model holds no figure and no account nickname, and a category name with a digit or a brace is not sent; a draft that uses a month-to-date figure without "this month" gives the code-built reply; `topicOf` reads names, one typo, "food", bill words, account kinds and nicknames, another period, and leaves everything else to the general summary; every code-built reply (no budget, over budget, nothing due, no payday) passes the same checks as a model's draft |
| Agent identity (ADR-034, ADR-051) | Unlinked handle gets only the sign-up reply; expired, reused, wrong and already-claimed link codes fail; nothing is linked before the website approves; "Not me" kills the request; 5 wrong codes lock the handle out; STOP revokes; one handle cannot link to two users |
| Proactive messages (ADR-038) | No send without opt-in; quiet hours hold messages until they end (default and user-set, including ranges crossing midnight); daily cap of 3; dedupe key prevents repeats; proactive text contains no digits representing amounts |
| Quiet-hours parsing (ADR-038) | "Reeflect, register new quiet hours 11PM to 7 AM", "11pm to 7am", "11 PM - 7 AM", "23:00 to 07:00" all parse to 23:00–07:00; equal start and end rejected; nonsense input returns an example; UNDO restores the previous setting |
| Code-only commands (ADR-040) | LINK, TRY, STOP and UNDO are executed by code even when phrased oddly; Gemini output can never trigger linking or unlinking; amounts and quiet-hours times are always validated by code; a simulated Gemini error or timeout returns the fallback reply |
| Job tick (ADR-041) | Rejects requests without the service token; running twice in a row sends nothing twice; held quiet-hours messages are released after quiet hours end; stale Nessie data triggers a sync |
| Judge demo (ADR-034) | TRY ignored when `DEMO_MODE` is off; links to a judge workspace when on; sixth judge gets "demo is full"; link expires after 2 hours; reset removes all judge links and workspaces |
| Worker protocol | Shared zod schemas accept valid turns and send requests and reject malformed ones |
| Worker send API (ADR-032) | `/send` answers 404 with no or a wrong token, 400 for a body that is not a send request (including an oversized one), sends once for a good request, and answers 502 when the send fails without logging the conversation or the text |
| Link confirmation (ADR-062) | Disconnect texts the phone that was linked, once, and no one when nothing is linked; "Not me" texts the phone that was waiting, and no one when no phone had used the code or it had expired; both hold when the text cannot be sent; neither text has a digit. Approving a link texts that phone once, with no digit in the text; a refused or expired request texts no one; the link holds when the text cannot be sent; `sendToPhone` sends the token, sends nothing without the worker's address, and is false on a refusal, an unreachable worker and a timeout |
| Worker relay (ADR-032) | Only inbound text in direct chats is forwarded; the service token is sent; an app error, a timeout, a malformed reply and an unreachable app each give the fallback reply; one conversation is answered in order; a refused typing indicator does not stop the reply, and is logged once with the platform's code; logs never hold the handle, the text or the token; settings are validated at start |
| Bill reminders (ADR-030) | Reminder created exactly 7 days before due date in the workspace time zone; due on the 31st falls on the last day of shorter months (including February in leap and non-leap years); lender date beats user date beats predicted; already-paid bill cancels the reminder; running the cron twice sends once; low-balance warning at balance one cent below, equal to, and above the amount; autopay wording; bills never appear as subscriptions |
| Forecast (ADR-026) | No recurring data; income later in month; last day of month |
| AI (ADR-019, ADR-059) | Label filling, including an unknown label and a stray brace; the digit scan rejects a model's own digits in any script and ignores digits in label names; the model chain skips a failed model, cools it off, keeps to its time budget and reports every attempt; the request is stateless (`store: false`); no key means no call |
| Website summary (ADR-045) | Every figure in the panel equals the value code computed; a Gemini error or timeout shows the fixed template with the same figures; no statement text is sent to Gemini |
| Crypto | Encrypt/decrypt round trip; tampered ciphertext fails; wrong key fails |

## TEST-05: Required integration tests (Vitest + real PostgreSQL)

| Area | Must cover |
|---|---|
| Repositories | Every repository function returns only rows for the given `workspaceId`, tested with two workspaces seeded with similar data |
| Import commit | Commit is atomic: a failure mid-commit leaves no partial rows; re-commit is idempotent |
| Statement storage | The stored CSV is read back exactly; a blocked preview stores nothing; a changed or missing CSV stops the commit; discard and account delete remove files. Runs against the Neon `storage-tests` branch's bucket (ADR-053), never production's; credentials from `.env.storage-tests` or CI secrets (`tests/support/storage-env.ts`) |
| Migrations | All migrations apply cleanly to an empty database. Budget recovery also upgrades a healthy database without changing allocations or ledger rows, and repairs a missing budget table after a newer unknown timestamp makes Drizzle skip 0010; existing migration history and ownership/amount constraints are preserved |
| Cascade deletes | Deleting an account or workspace removes all dependent rows |
| Categorization persistence | Atomic override-plus-rule save and rollback; later transactions; manual transaction creation/editing integrates within the existing balance transaction; rule edits/deletion preserve manual choices; cross-workspace category references rejected; unchanged transaction facts and balances; idempotent presets; pagination and batched updates |
| Budget persistence | Current/next-month upsert and removal; historical allocations preserved; atomic, idempotent copy fills missing allocations without overwriting zero; concurrent saves/copies; forced copy rollback; ownership and DB constraints; effective rules including renamed categories; repeatable snapshot during concurrent rule/ledger edits; more than 500 monthly rows; excessive history fails without partial totals; ledger rows/balances unchanged |
| Synthetic batches | Loading is atomic (one bad row writes nothing); deleting a batch removes its workspaces, accounts, transactions and markers and leaves other batches alone; a batch row cannot be deleted while its workspaces exist (`scripts/batch/store.test.ts`) |

## TEST-06: Required security tests

| Test | How |
|---|---|
| **Workspace isolation matrix** | One parametrized test iterates over every server action and route handler. For each: user A (member of workspace 1 only) calls it with workspace 2's id and with object ids belonging to workspace 2. Expected: not found, no data returned, no rows changed. Each feature lists its entry points in `src/features/<feature>/server/entry-points.ts`; `src/lib/auth/isolation.test.ts` runs every list, so a feature adds its list there. |
| Role enforcement | Viewer cannot write; editor cannot invite or delete workspace; owner can |
| Unauthenticated access | Every protected route redirects or returns 401 |
| Input validation | Invalid ids, oversized strings, negative page sizes rejected with 400-class errors |
| Upload limits | Oversized file, wrong magic bytes, too many pages, encrypted PDF all rejected |
| Token handling | Plaid access token never appears in any response body, rendered HTML, or log output (spy on logger) |
| Client bundle secrets | After `pnpm build`, scan `.next/static` for secret-looking strings and every non-`NEXT_PUBLIC_` env var value; fail if found |
| Webhook verification | Unsigned or wrongly signed webhook is rejected and causes no writes |
| Rate limiting | Repeated failed sign-ins are throttled |
| Session | Sign-out invalidates the session; switching workspaces clears client state |

## TEST-07: Required Playwright suites

| Suite | Flow |
|---|---|
| `auth.spec.ts` | Sign up, confirm the email from the outbox (ADR-052), sign in, sign out, wrong password, unverified sign-in, password reset, bad links |
| `workspaces.spec.ts` | Personal workspace exists after sign-up; create household; invite link; second user joins with correct role; switching workspaces changes the calendar |
| `accounts.spec.ts` | Add each account type; edit; delete with confirmation |
| `categorization.spec.ts` | Categorize a transaction and save a rule; existing/later matches; manual Uncategorized and return to automatic; edit priority/category and delete rule; rename category; invalid input; viewer/stranger access; pagination; 360px dark/reduced-motion; failed-load recovery |
| `csv-import.spec.ts` | Upload a 360 export, preview, commit; duplicate upload blocked; card export with no balances; wrong account blocked; other bank fails clearly. Column mapping when it is built |
| `pdf-import.spec.ts` | Supported statement imports and reconciles; wrong bank blocked; unsupported layout fails clearly |
| `nessie-live.spec.ts` | Tagged `@external`: against the real Nessie sandbox, create a customer and a purchase, sync, verify the transaction appears |
| `worker-idle.spec.ts` | Tagged `@external`, run manually before the event weekend: leave the deployed worker idle for 30 minutes, then send a text; a reply must arrive within 10 seconds (ADR-041) |
| `agent-terminal.spec.ts` | Tagged `@external`: run the worker with Spectrum's terminal provider against a running app; "how am I doing?" returns numbers that match the dashboard |
| `plaid.spec.ts` | Sandbox link flow with Plaid's test credentials. Tagged `@external`: runs in the nightly workflow, not on every PR, because it calls an external service |
| `calendar.spec.ts` | Add spending to a day and the per-day headline drops; select a day and its items, sources and balance show; filter by kind; switch to list; arrow keys move between days; mark a subscription and the yearly saving appears; with a payday confirmed, a linked phone that texts "how am I doing?" gets the same per-day figure as the headline (F-25) |
| `quiet-hours.spec.ts` | Change quiet hours on the website; the setting shows as saved; an iMessage quiet-hours command (simulated through `/api/agent/turn`) updates the same setting on the page |
| `agent-log.spec.ts` | A linked phone texts "12 lunch": the confirmation names the category, the dashboard's balance drops and the day shows the row as "texted in"; a typo is logged, an amount in words and a bare amount are asked about; UNDO twice removes both and the balance is back. With two accounts the agent asks which, numbering them, and the next text answers by number or by "my checking account"; naming the account in the first text ("on card") needs no question (F-27, ADR-064, ADR-065) |
| `agent-questions.spec.ts` | Set a Groceries budget on the Budgets page; a linked phone texts "40 groceries", then asks "whats left in my grocries budget": the reply's spent, remaining and budget figures are the ones the Budgets page shows; asking about last month says only this month so far is available; "whats in my checking?" gives the account's name and balance; "what bills are coming up?" with no payday confirmed says where to confirm one; "how am I doing?" is still the general summary (F-28, ADR-059) |
| `agent-link.spec.ts` | On the website, start "Connect iMessage"; simulate the inbound LINK message through `/api/agent/turn` with the service token; approve the request on the card; identity appears as connected, the page says a text was sent and a stand-in worker (`tests/support/stand-in-worker.ts`) has received exactly one confirmation for that phone (ADR-062); "Not me", Disconnect and STOP each leave the phone unlinked, and the stand-in worker has one declined text after "Not me", one disconnected text after Disconnect and nothing more after STOP; the endpoint is a 404 without the token (ADR-051) |
| `nessie.spec.ts` | Connect Capital One sandbox using mocked Nessie responses; accounts and transactions appear; the calendar and headline reflect them |
| `bills.spec.ts` | Add a manual car payment due in 7 days; run the reminder job; reminder appears in Upcoming bills with amount and date; mark it paid by adding the payment; reminder disappears |
| `recurring.spec.ts` | Confirm fixed subscriptions and variable bills; show evidence and actual spending separately from estimates; preserve Keep/planning-to-cancel through refresh; later imports/credits and fingerprint duplicates; manual rent create/edit/remove/restore; persistent dismissal; kind/amount corrections and invalid inputs; viewers/outsiders; filtering/pagination; retry boundary and 360px dark/reduced-motion layout |
| `budgets.spec.ts` | Set/edit/remove/zero allocations; retained validation input; refunds, card spending, transfers, pending/future rows and Uncategorized; copy without overwriting zero or history; next-month planning; over 500 monthly rows and a year of historical data; changed rules/renames; viewer/outsider access; failed-read retry without fake totals; keyboard, 360px, themes and reduced motion |
| `transfers.spec.ts` | Explicit ambiguous choice and confirmation; persistence; detach keeps labels; separate normal activity; stale retained selection; paired edit/delete cleanup; old-window padding and counterpart pages; viewer/outsider; Bills allocation feedback; failed-read retry; keyboard, 360px, light/dark and reduced motion. Synthetic screenshots are in `docs/screenshots/transfers/` |
| `demo-path.spec.ts` | The exact demo script from sign-in to final screen, on the seeded workspace |
| `a11y.spec.ts` | axe checks on every main page in light and dark themes; zero serious or critical violations |
| `reduced-motion.spec.ts` | With reduced motion emulated, no animation runs and all labels still show |
| `responsive.spec.ts` | Dashboard at 360px, 768px, and 1440px wide: no horizontal scroll, numbers panel visible |

## TEST-08: Fixtures and data

- All fixtures in `tests/fixtures/` are **synthetic**. Never commit a real
  statement, CSV export, account number, or person's name.
- Each PDF template has at least: one normal statement, one with zero
  transactions, one multi-page statement, and one deliberately altered to
  fail reconciliation by $0.01.
  The Capital One fixtures are in `tests/fixtures/pdf/`, drawn from
  `specs.ts` by `generate.ts` (the command is at the top of that file);
  commit the PDFs after changing a spec. pdf-lib cannot write an encrypted
  PDF, so that case is a unit test with the PDF library mocked
  (`extract-pdf-errors.test.ts`). A real or redacted statement used to build
  a template stays in a gitignored `private/` folder.
- `pnpm db:seed` builds the demo workspace from the same fixture generators,
  so the demo and the tests use identical data shapes.
- The synthetic generator (ADR-049, `docs/SYNTHETIC.md`) is that generator.
  Its example spec is `tests/fixtures/synthetic/example-spec.json`.

## TEST-09: CI gates

All of these run on every pull request and must pass before merge. Job names
must match the required checks in `.github/rulesets/main.json`.

| CI job | Runs |
|---|---|
| `lint-typecheck` | `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm docs:check` |
| `unit` | `pnpm db:migrate` on a fresh database, `pnpm db:verify --target app`, then `pnpm test:unit` with coverage thresholds |
| `e2e` | `pnpm db:migrate`, `pnpm db:verify --target app`, `pnpm build`, `pnpm scan:bundle`, `pnpm test:e2e --grep-invert @external` |
| `security` | `pnpm audit --prod --audit-level high` |
| `codeql` (separate workflow) | Static analysis for JavaScript/TypeScript |

`unit` and `e2e` each start a PostgreSQL service and apply every migration
to it first. Locally the same database comes from `docker compose up -d`.
Database tests never connect to Neon; storage tests use the dedicated test
bucket. [Database readiness](DATABASE_READINESS.md) explains the verifier's
isolated fault fixtures, permission checks and release limitations.

The workspace isolation matrix (TEST-06) includes `/api/agent/turn`: a
linked handle for user A can never cause a tool call against user B's
workspace, whatever the message text says.

Its before/after snapshots compare every row and column in a stable primary-key
order. PostgreSQL may change scan plans without changing data; a regression test
switches between sequential and index scans to verify that this cannot produce
a false isolation failure.

The phone-link server actions are in the matrix
(`src/features/messaging/server/entry-points.ts`). They have one rule the
matrix cannot express, tested in
`src/features/messaging/server/actions.test.ts`: a workspace the user owns
that is not their Personal one is also not found (ADR-034).

Skipped tests (`.skip`, `.only`) fail the lint step, through an ESLint rule
on test files.

`pnpm docs:check` is one Node script with no extra dependencies
(`scripts/docs-check.ts`). It fails when any of these is false:

1. Every `ADR-`, `ARCH-`, `TEST-` and `HO-` id cited in `docs/`, `AGENTS.md`,
   `.coderabbit.yaml`, `.github/` or `src/` matches a heading that exists.
2. Ids are unique and in sequence, and every ADR has a Status line. Retired
   ADR numbers may be cited but not reused.
3. Every "Superseded by ADR-N" names an ADR that exists.
4. The first command table in `AGENTS.md` section 5 and the `scripts` in
   `package.json` list the same commands.
5. The required checks in `.github/rulesets/main.json` match the names of the
   jobs in workflows that run on pull requests.
6. Every relative file link in the docs points to a file that exists.

It checks references only. Whether the prose still matches the build is left
to review.

## TEST-10: Writing tests (conventions)

- Unit tests sit next to the code: `thing.ts` → `thing.test.ts`.
- E2E specs live in `tests/e2e/`.
- Test names describe behaviour: `"blocks commit when closing balance is off by one cent"`.
- No sleeps in Playwright; wait for visible text or network idle.
- Each test creates its own workspace; tests never depend on order.


Web Bills adds real PostgreSQL tests for canonical schedule/invoice rollback,
optimistic revisions and concurrent links, unique allocation, composite ownership
FKs, stale/deleted evidence, history limits, read snapshots, lifecycle preservation
and unchanged financial rows. All Bills actions and both page loaders join the
isolation matrix. The matrix's synthetic previews have no storage objects; it
stubs the storage boundary while dedicated import/storage suites retain real
Neon coverage. Playwright exercises variable invoices, posted partial/full
payment, undo/unlink, stop/restore, invalid/stale forms, viewer/outsider access,
pagination/filtering, mobile keyboard flows, themes and failed-read recovery.
No agent, reminder delivery or dashboard feature is added by these tests.
