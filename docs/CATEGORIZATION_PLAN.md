# F-08 categorization implementation plan

Status: isolated engine implemented; live integration and persistence remain
pending. Work is on `feat/transaction-categorization`, based on main `02c5154`.

Governed by [PROJECT.md](PROJECT.md) F-08, [ADR-013](DECISIONS.md),
[ARCH-02](ARCHITECTURE.md), and [TEST-02 through TEST-04](TESTING.md).

## Goal and confidence

Build a small deterministic categorization engine that imports, Nessie sync,
and manual transactions can call. Confidence is high for this isolated scope:
it needs no database, network, credentials, money arithmetic, or new dependency.
No software change can guarantee that the entire app will never crash.
Confidence in live integration must come from verifying the actual caller.

The first milestone is a tested engine. It is not the complete F-08 feature:
persisted overrides and saved rules depend on the transaction and workspace
data layer. The user-facing feature needs Vitest and Playwright coverage before
it is considered complete or mergeable (TEST-02).

The engine lives in `src/features/categorization/`, with an exported public
API and a README for consumers. Category and rule tables, a transaction category
column, and the manual transaction UI are still absent on this main revision.
The existing personal workspace and financial account implementations are
preserved. Current verification results are recorded in HANDOFF.md.

## File boundaries and coordination

- Work on a dedicated feature branch or checkout during implementation.
- Keep engine changes under `src/features/categorization/`, with adjacent
  tests and an exported `index.ts` as the public entry point.
- Document the feature's types and examples alongside the module.
- Record scope and status in the handoff log; its assignment table currently
  lists F-08 as unassigned. Confirm ownership before claiming the assignment
  if teammates' current work is not reflected there.
- Engine work leaves existing pages, calendar logic, auth, schemas, migrations,
  global CSS, package dependencies, lockfiles, and CI configuration unchanged.
- Review the diff before each integration step to detect concurrent edits.
  Preserve unrelated work and keep any shared-file edits limited to the caller.

## Engine behavior

1. Normalize merchant descriptions: lowercase, trim, collapse whitespace,
   and conservatively remove recognizable store numbers and reference codes.
   Preserve meaningful digits in merchant names. Retain the original description.
2. Match supplied rules using `contains`, `starts_with`, or `exact` string
   comparisons. Never execute rule text as a regular expression or code.
3. Highest priority wins. Define and test a stable tie-break so reordering
   the same rules does not change the result.
4. An explicit manual category overrides automatic matching. An unmatched
   description returns an uncategorized result without inventing a database id.
5. Return category and rule provenance without mutating the transaction or
   rules. Classification never changes amounts, dates, account ids, or transfer
   flags. Pass in rules already scoped to the caller's verified workspace.
6. Use the existing Zod dependency for invalid rule/input handling with an
   explicit validation result. Empty patterns must not match every transaction.
   An unmatched valid input is different from invalid input.

## Implementation sequence

1. Record the baseline revision, existing diff, and check results. Run lint,
   format check, strict typecheck, current unit tests, production build, bundle
   scan, and existing non-external Playwright tests using the local test database.
   Report any existing failures separately; do not weaken checks to get a pass.
2. Define the smallest public input/result types and examples for consumers.
   Keep category ids and persistence outside the engine's responsibility.
3. Implement normalization and rule selection with focused behavior tests.
4. Verify determinism, manual override precedence, malformed input handling,
   and unchanged transaction data. Review the final engine diff and public API.
5. Connect one real transaction/import caller once its data contract and feature
   ownership are established. Validate external inputs at its boundary and use
   the existing workspace authorization pattern for any read or write.
6. Add Playwright coverage of automatic categorization, a manual override,
   saving a rule, and applying it to a later matching transaction. Preserve
   manual overrides on re-import; an invalid rule saves nothing and displays
   a clear error. Re-run the existing critical flows against the same build.
7. Record exact results, remaining dependencies, and rollback instructions.
   Implementation ends with a reviewable diff; commit, push, and PR actions
   require the user's explicit instruction under AGENTS.md section 7.

## Verification cases and release gate

- Merchant case, whitespace, recognizable store/reference suffixes, meaningful
  digits, Unicode, and empty descriptions.
- All three match modes, overlapping rules, priorities, deterministic ties,
  invalid/empty patterns, no rules, and no matches.
- Manual override wins; supplied objects are unchanged; transaction amounts
  and totals are unchanged; repeated calls produce the same result.
- Feature-domain coverage meets the existing 95% line / 90% branch thresholds.
- Lint, format check, strict typecheck, unit coverage, docs check, production
  build, bundle scan, and relevant non-external Playwright checks all pass.
- Browser verification covers sign-in, dashboard navigation, adding spending,
  filtering, and categorization after integration, including page errors.
- A blocked or incomplete check is reported as unverified. The engine alone
  is not represented as a finished user-facing feature.

## Failure handling and rollback

Expected unknown merchants return an uncategorized result. Invalid input
returns a validation failure that the caller handles; it does not silently
assign a guessed category or write partial data. Unexpected errors are reported
without sensitive transaction contents, and the failed operation leaves its
previous saved state intact.

If engine checks fail, fix them within the new module before integration.
If integration introduces a regression, remove its specific call/import and
restore the caller's previous behavior, preserving teammates' changes. Do not
use a repository-wide reset. There is no categorization migration to reverse
in the engine milestone; rule persistence needs its own verified data-layer work.

## Hackathon budget

Target roughly 30–60 minutes for the isolated engine and focused tests, subject
to test setup. Production and browser regression verification are separate
from that estimate. Budget live integration with its owner when the data layer
is available. Keep the work limited to ADR-013 and leave time for a final
end-to-end demo check; no AI categorization, new vendor, or broad refactor is
needed for this milestone.
