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

Coverage is a floor, not the goal. Boundary cases below are required even
when coverage is already met.

## TEST-04: Required unit tests by area

| Area | Must cover |
|---|---|
| `lib/money` | Parsing "$1,234.56", "(12.00)", "-12", "12.5" (→ 1250 cents); rejecting non-USD and malformed input; rounding half to even; splitting without losing cents (e.g. $10.00 / 3); formatting negatives; `Number.isSafeInteger` enforcement |
| Money properties (fast-check) | Sum of category spending equals total spending; splitting then summing returns the original; add/subtract are inverse; no operation produces a non-integer |
| Cash flow (`src/features/cashflow/domain`, ADR-042) | Per-day amount with balance above, equal to and below what is due before payday (never negative); payday tomorrow (N = 1) and no expected income; repeating items clamped to the last day of short months; a month's end balance equals its start plus its items; later months carry the earlier months' balance; a no-spend day needs nothing going out; yearly subscription cost and saving; every number shown has a text label |
| Budgets | Calendar month boundaries in the workspace time zone (11:59 PM on the 31st vs 12:00 AM on the 1st); budget change mid-month; refunds reducing spending |
| Categorization | Rule priority; `contains` / `starts_with` / `exact`; merchant normalization (store numbers, reference codes); manual override beats rules |
| Recurring (ADR-014) | Three monthly charges → subscription; three grocery visits at random intervals → no subscription; price change beyond ±15% flagged; weekly cadence; manual mark |
| Transfers (ADR-020) | Checking → card payment pairs and is excluded from spending; same amount but more than 3 days apart does not pair; two candidates for one transaction pairs only once; unpairing |
| Import guardrails (ADR-010) | Each check in the ADR-010 table passes and fails; nothing written when any blocking check fails; duplicate file; overlapping periods dedupe; reconciliation off by $0.01 blocks |
| CSV parsing | Each sign convention; date formats; extra header rows; trailing blank lines; quoted commas; UTF-8 BOM |
| PDF parsing (ADR-044) | Each supported template against fixture PDFs; encrypted PDF rejected; image-only PDF rejected; wrong-bank PDF blocked by identity check |
| Nessie mapping (ADR-033) | `fromDollarNumber`: 12.1 → 1210, 0.1 + 0.2 style inputs, 19.999 rejected, negative and zero amounts; purchase on a credit-card account is negative; deposit positive; transfer pairs; bill → `recurring_series` kind `bill` with lender due date; loan → `liability`; re-sync creates no duplicates (external id) |
| Nessie client | API key never appears in thrown errors or log output (spy on logger with a failing request); every purchase, deposit, withdrawal and transfer is sent with `status`; dates that are not real `YYYY-MM-DD` days are rejected before sending; amounts with cents are rejected for everything except bills; a 400 on one account's list skips that account only (ADR-048) |
| Synthetic generator (ADR-049) | Same spec and seed give identical rows, and a different seed gives different rows; extending the span leaves earlier months unchanged; nothing after `asOf`; weekend paydays move to Friday; yearly charges only in their month; every transfer is an equal and opposite pair on two accounts on one day; card full, minimum ($25 floor) and fixed payments; interest only on carried balances; closing balance = opening + rows; whole-dollar mode emits no cents and no zeros; spec validation rejects bad input with readable paths; plausibility warnings fire |
| Database targets (ADR-049) | Endpoint ids parsed from pooled and direct URLs; passwords never printed; a branch URL that is really production is refused; production refused without a matching `NEON_PRODUCTION_ENDPOINT_ID`; migrations compared with the journal (applied, pending, unknown) |
| Agent intent parsing (ADR-035) | "12 lunch", "$12.50 coffee", "lunch 12", "spent twelve dollars" (asks instead of guessing), two numbers in one message (asks), LINK codes, STOP, keep / cancel / yes |
| Agent number rule | `logSpending` rejects amounts not present in the user's text; every reply passes the digit scan; model-invented digits trigger the fallback template |
| Agent identity (ADR-034) | Unlinked handle gets only the sign-up reply; expired, reused and wrong link codes fail; STOP revokes; one handle cannot link to two users |
| Proactive messages (ADR-038) | No send without opt-in; quiet hours hold messages until they end (default and user-set, including ranges crossing midnight); daily cap of 3; dedupe key prevents repeats; proactive text contains no digits representing amounts |
| Quiet-hours parsing (ADR-038) | "Reeflect, register new quiet hours 11PM to 7 AM", "11pm to 7am", "11 PM - 7 AM", "23:00 to 07:00" all parse to 23:00–07:00; equal start and end rejected; nonsense input returns an example; UNDO restores the previous setting |
| Code-only commands (ADR-040) | LINK, TRY, STOP and UNDO are executed by code even when phrased oddly; Gemini output can never trigger linking or unlinking; amounts and quiet-hours times are always validated by code; a simulated Gemini error or timeout returns the fallback reply |
| Job tick (ADR-041) | Rejects requests without the service token; running twice in a row sends nothing twice; held quiet-hours messages are released after quiet hours end; stale Nessie data triggers a sync |
| Judge demo (ADR-034) | TRY ignored when `DEMO_MODE` is off; links to a judge workspace when on; sixth judge gets "demo is full"; link expires after 2 hours; reset removes all judge links and workspaces |
| Worker protocol | Shared zod schemas accept valid turns and reject malformed ones; worker refuses `/send` without the token |
| Bill reminders (ADR-030) | Reminder created exactly 7 days before due date in the workspace time zone; due on the 31st falls on the last day of shorter months (including February in leap and non-leap years); lender date beats user date beats predicted; already-paid bill cancels the reminder; running the cron twice sends once; low-balance warning at balance one cent below, equal to, and above the amount; autopay wording; bills never appear as subscriptions |
| Forecast (ADR-026) | No recurring data; income later in month; last day of month |
| AI (ADR-019) | Placeholder filling; digit scan rejects model-invented digits; fallback template used on rejection |
| Website summary (ADR-045) | Every figure in the panel equals the value code computed; a Gemini error or timeout shows the fixed template with the same figures; no statement text is sent to Gemini |
| Crypto | Encrypt/decrypt round trip; tampered ciphertext fails; wrong key fails |

## TEST-05: Required integration tests (Vitest + real PostgreSQL)

| Area | Must cover |
|---|---|
| Repositories | Every repository function returns only rows for the given `workspaceId`, tested with two workspaces seeded with similar data |
| Import commit | Commit is atomic: a failure mid-commit leaves no partial rows; re-commit is idempotent |
| Migrations | All migrations apply cleanly to an empty database |
| Cascade deletes | Deleting an account or workspace removes all dependent rows |
| Synthetic batches | Loading is atomic (one bad row writes nothing); deleting a batch removes its workspaces, accounts, transactions and markers and leaves other batches alone; a batch row cannot be deleted while its workspaces exist (`scripts/batch/store.test.ts`) |

## TEST-06: Required security tests

| Test | How |
|---|---|
| **Workspace isolation matrix** | One parametrized test iterates over every server action and route handler. For each: user A (member of workspace 1 only) calls it with workspace 2's id and with object ids belonging to workspace 2. Expected: not found, no data returned, no rows changed. A new entry point that is missing from the matrix fails the test (the matrix is built from an exported registry). |
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
| `auth.spec.ts` | Sign up, sign in, sign out, wrong password |
| `workspaces.spec.ts` | Personal workspace exists after sign-up; create household; invite link; second user joins with correct role; switching workspaces changes the calendar |
| `accounts.spec.ts` | Add each account type; edit; delete with confirmation |
| `csv-import.spec.ts` | Upload, map columns, preview, commit; duplicate upload blocked; wrong account blocked |
| `pdf-import.spec.ts` | Supported statement imports and reconciles; wrong bank blocked; unsupported layout fails clearly |
| `nessie-live.spec.ts` | Tagged `@external`: against the real Nessie sandbox, create a customer and a purchase, sync, verify the transaction appears |
| `worker-idle.spec.ts` | Tagged `@external`, run manually before the event weekend: leave the deployed worker idle for 30 minutes, then send a text; a reply must arrive within 10 seconds (ADR-041) |
| `agent-terminal.spec.ts` | Tagged `@external`: run the worker with Spectrum's terminal provider against a running app; "how am I doing?" returns numbers that match the dashboard |
| `plaid.spec.ts` | Sandbox link flow with Plaid's test credentials. Tagged `@external`: runs in the nightly workflow, not on every PR, because it calls an external service |
| `calendar.spec.ts` | Add spending to a day and the per-day headline drops; select a day and its items, sources and balance show; filter by kind; switch to list; arrow keys move between days; mark a subscription and the yearly saving appears |
| `quiet-hours.spec.ts` | Change quiet hours on the website; the setting shows as saved; an iMessage quiet-hours command (simulated through `/api/agent/turn`) updates the same setting on the page |
| `agent-link.spec.ts` | On the website, start "Connect iMessage"; simulate the inbound LINK message through `/api/agent/turn` with the service token; identity appears as connected; unlink works |
| `nessie.spec.ts` | Connect Capital One sandbox using mocked Nessie responses; accounts and transactions appear; the calendar and headline reflect them |
| `bills.spec.ts` | Add a manual car payment due in 7 days; run the reminder job; reminder appears in Upcoming bills with amount and date; mark it paid by adding the payment; reminder disappears |
| `subscriptions.spec.ts` | Subscription appears after third monthly charge; mark keep/cancel; app shows no cancel-the-subscription action |
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
| `unit` | `pnpm db:migrate` on a fresh database, then `pnpm test:unit` with coverage thresholds |
| `e2e` | `pnpm db:migrate`, `pnpm build`, `pnpm scan:bundle`, `pnpm test:e2e --grep-invert @external` |
| `security` | `pnpm audit --prod --audit-level high` |
| `codeql` (separate workflow) | Static analysis for JavaScript/TypeScript |

`unit` and `e2e` each start a PostgreSQL service and apply every migration
to it first. Locally the same database comes from `docker compose up -d`.
Tests never connect to Neon.

The workspace isolation matrix (TEST-06) includes `/api/agent/turn`: a
linked handle for user A can never cause a tool call against user B's
workspace, whatever the message text says.

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
