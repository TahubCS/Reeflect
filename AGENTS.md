# AGENTS.md (Reeflect)

This is the single source of truth for every coding agent working in this
repository: Claude Code, Codex, Gemini CLI, GitHub Copilot and CodeRabbit.
Read this whole file before doing anything. Detailed docs live in `/docs`.

| Doc | Read it when |
|---|---|
| `docs/PROJECT.md` | You need to know what the product is, who it's for, and what is in or out of scope |
| `docs/ARCHITECTURE.md` | You touch structure, data, auth, imports, the calendar, AI or integrations |
| `docs/DECISIONS.md` | Before any non-trivial change: find the ADRs that govern it |
| `docs/TESTING.md` | Before writing or changing any code: every change ships with tests |
| `docs/HANDOFF.md` | At the start of every session (read the latest entry) and at the end (append one) |
| `docs/PITCH.md` | You change a feature that appears in the demo script; keep the script true to the build |
| `docs/SYNTHETIC.md` | You write a synthetic population spec, or load, promote or delete a batch |

---

## 1. What this project is

Reeflect is personal finance for everyday people (not investors or traders).
**It lives in your texts; the calendar shows what's coming.**

- **iMessage agent** (Photon Spectrum + Google Gemini): users text "how am I
  doing?", log spending, and get subscription alerts and bill reminders.
- **Web app** (Next.js): a **cash-flow calendar** (ADR-042). The month is
  laid out day by day with paydays, bills, subscriptions and spending, under
  a headline that says what you can spend per day until payday, with a
  balance line across the month. Exact numbers are always on screen. There
  is no aquarium: ADR-016 and ADR-017 are superseded.
- **Data:** Capital One's Nessie sandbox (demo source), bank statements as
  CSV and PDF, parsed by code (ADR-044), and manual entry. Plaid later.

**What to build this weekend** is set by ADR-043: the calendar, statement
parsing, Nessie and the iMessage agent first; then subscriptions, budgets,
bill reminders and the Gemini summary (ADR-045). Everything else waits.

Built for HackNC 2026 (October 9–11, 2026) as an MVP that must stay clean
enough to keep building afterwards. Tracks: Beginner/General, Photon AI Agent,
Best Use of Nessie, MLH Best Use of Gemini API (ADR-036).

**The product is named Reeflect** (ADR-002). Never hard-code the name. Use
`APP_NAME` from `src/config/app.ts` in code and UI copy.

## 2. What this project is NOT

Do not build, suggest, or scaffold any of the following:

- Investing, trading, brokerage, crypto, or stock features. Showing how much
  money went into retirement or investing, as saving, is allowed (ADR-055);
  holdings, prices, returns and trades are not.
- Financial product recommendations or investing advice ("you should
  buy/switch to…"). Gemini may suggest what the user could do with their own
  spending, from numbers code computed (ADR-045).
- Money movement of any kind: payments, transfers, bill pay, cancelling
  subscriptions on the user's behalf. The app only reads, displays, and lets
  the user mark intentions.
- Collection or storage of raw bank usernames or passwords. Bank linking goes
  through Plaid Link only (ADR-012).
- Real credit scores (ADR-024). Any credit score shown is labelled "Sample".
- Non-USD currencies (ADR-008). Reject non-USD data; do not convert.
- Shame mechanics: no alarms, no guilt copy, no failure states (ADR-042).
- Numbers produced by an AI model (ADR-019, ADR-035).
- Any financial data sent to a phone handle that is not linked and verified
  (ADR-034).
- A general-purpose chatbot: the agent only talks about the user's money and
  Reeflect.
- Real customer data in Nessie; it is a shared sandbox (ADR-033).

## 3. Before starting any task

1. **Check the branch.** Run `git branch --show-current`.
   - If it prints `main` (or nothing, i.e. detached HEAD): **stop and ask the
     user** for a branch name, or for permission to create one you propose.
     Then run `git switch -c <branch>` (or `git switch <branch>` if it exists).
   - Never commit or push anything without the user's explicit permission
     (section 7). Never commit to `main`. Never push to `main`. Never force-push a branch
     someone else is working on.
   - Branch names: `<type>/<short-kebab-description>`, where type is one of
     `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`.
     Example: `feat/csv-import-column-mapping`.
2. **Read the latest entry in `docs/HANDOFF.md`.**
3. **Find the governing ADRs** in `docs/DECISIONS.md`.
   - Status `Accepted`: follow it.
   - Status `Proposed`: follow it as the current plan, but if your task would
     be expensive to reverse (database schema, auth, a new external vendor,
     deleting data), confirm with the user before starting.
   - If the task conflicts with any ADR: stop and ask. Never silently deviate.
     New or changed decisions are recorded as a new ADR (never edit an
     Accepted ADR's decision; supersede it).

## 4. Non-negotiable rules

### Money
- All money is **integer cents**. Database columns are `bigint` (Drizzle
  `mode: 'number'`); in TypeScript the type is the branded `Cents` from
  `src/lib/money`. Never use floating-point dollars for storage or math.
- All arithmetic, rounding, splitting, parsing and formatting of money goes
  through `src/lib/money`. No ad-hoc `* 100`, `/ 100`, `toFixed`, or
  `parseFloat` on money anywhere else. If the function you need is missing,
  add it there with tests. `src/lib/money` is still smaller than ADR-008
  asks: no split without losing cents yet, and `fraction` rounds half up,
  not half to even (HO-026).
- Sign convention: amounts are signed from the account holder's point of view.
  Positive = money into that account. Negative = money out of that account.
  A credit-card purchase is negative on the card account.
- Transfers between the workspace's own accounts and credit-card payments are
  **never** spending or income (ADR-020).
- USD only.

### Data isolation and auth
- Every row of financial data belongs to exactly one workspace
  (`workspace_id`). Every query that reads or writes financial data filters by
  the active workspace and goes through the feature's server repository
  functions (`src/features/<feature>/server/`).
- Every server action and route handler calls
  `requireWorkspaceAccess(session, workspaceId, minimumRole)` from
  `src/lib/auth/authz.ts` before touching data (ARCH-04). Roles are in
  `src/lib/auth/permissions.ts` and ordered in `src/lib/auth/roles.ts`.
- Never import the database client into React components or client code.
  Server-only modules start with `import 'server-only'`.
- Never cache per-user or per-workspace data in any shared cache. Pages that
  show user data are dynamically rendered.
- Validate every external input (forms, route params, uploads, webhooks,
  third-party API responses) with `zod` at the boundary.

### Secrets and credentials
- Secrets live in environment variables only. Only values that are safe to
  publish may use the `NEXT_PUBLIC_` prefix.
- Plaid access tokens are encrypted at rest (`src/lib/security/crypto.ts`)
  and never sent to the browser or written to logs.
- Never log full account numbers, tokens, file contents, or whole transaction
  objects. Log ids.

### Imports (CSV, PDF, Plaid)
- Every import targets exactly one financial account and must pass the import
  guardrails in ADR-010: identity check, duplicate detection, and (for PDFs)
  balance reconciliation. Never merge data across accounts automatically.
- Raw uploaded files are never kept: a PDF is read in memory and only its
  SHA-256 is stored (ADR-025). Each import's rows are kept as one canonical
  CSV in the private `statements` bucket, checked against the parsed rows
  before it is stored and again at commit (ADR-053). Never log a CSV's
  contents, and never give the browser a storage key or URL.

### AI and the agent
- AI may classify, map, and write sentences. It may **never** produce a
  number shown to the user. Numbers come from deterministic code and are
  inserted into AI text through placeholders (ADR-019). The only exceptions
  are in ADR-035 (amounts taken from the user's own text; receipt values the
  user confirms).
- The agent's workspace id always comes from the verified messaging identity
  (ADR-034), never from model output or message text.
- The worker (`agent-worker/`) contains no business logic and never touches
  the database, Nessie, Plaid or Gemini (ADR-032). It only relays.
- Proactive messages respect opt-in, user-set quiet hours and the daily cap,
  and never put amounts in the message text (ADR-038).
- Design every AI feature as if Gemini were on the paid tier (ADR-040). Code
  still executes LINK / TRY / STOP / UNDO and validates amounts and times.
  Until the paid key exists, only sandbox or synthetic data goes to Gemini.
  Every Gemini call needs an error fallback.
- The agent declines non-finance topics.
- A receipt photo is sent to Gemini only when `AGENT_RECEIPT_PHOTOS` is
  `on`, and is never stored or logged. What the model reads is a proposal:
  code checks it and nothing is saved until the person confirms (ADR-067).
  Only generated receipts go in `tests/fixtures`.

### Nessie
- Convert Nessie dollar amounts with `fromDollarNumber` from `src/lib/money`
  only (ADR-033). It does not exist yet: add it to `src/lib/money`, with
  the TEST-04 cases, in the PR that adds the Nessie client.
- The Nessie key travels in the URL query string: never log request URLs or
  raw errors from the Nessie client without redaction.
- Nessie starts empty and drops cents on everything but bills (ADR-048).
  Send whole dollars and always send `status`; compute balances yourself.
- Never call Nessie's `DELETE /data`: it wipes the whole shared key.
- Never put a key in `public/`: it is served to everyone.

### UI and accessibility
- Every visual state of the calendar has a text equivalent on screen or in an
  accessible label. Colour is never the only signal.
- Honour `prefers-reduced-motion`. WCAG 2.2 AA contrast in light and dark
  themes.
- Responsive from 360px wide phones to large desktops.
- **Styling is plain CSS (ADR-046).** Colours, spacing and type sizes are
  custom properties in `src/app/globals.css`; component styles are CSS
  Modules that use those properties. Tailwind is installed only as a
  fallback: use a utility class on one specific element when plain CSS would
  be clearly worse, never as a component's main styling.

### Tests
- Every change ships with tests per `docs/TESTING.md`. A feature is not done
  without both Vitest and Playwright coverage.

## 5. Commands

`package.json` defines exactly these scripts; CI calls them. `pnpm docs:check`
fails if this table and `package.json` differ.

| Command | Purpose |
|---|---|
| `pnpm dev` | Run the app locally |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint (no warnings allowed; `.only` and `.skip` in tests are errors) |
| `pnpm format` | Prettier: rewrite code and config files (Markdown is left alone) |
| `pnpm format:check` | Prettier check |
| `pnpm typecheck` | Generate route types, then `tsc --noEmit` in strict mode for the app and for `agent-worker/` |
| `pnpm docs:check` | Check that the docs and config agree with each other (TEST-09). Run it after editing any doc, `.coderabbit.yaml`, CI job names or `package.json` scripts |
| `pnpm test:unit` | Vitest, with coverage thresholds |
| `pnpm test:e2e` | Playwright against the production build (`pnpm build` first). Tests that call external services are tagged `@external`; CI runs them nightly only |
| `pnpm scan:bundle` | After `pnpm build`, scan the client bundle for secrets and server-only env values |
| `pnpm db:generate` | Drizzle Kit: generate a migration from schema changes |
| `pnpm db:migrate` | Apply migrations (uses `DATABASE_URL_UNPOOLED` when set) |
| `pnpm db:migrate:to` | Apply migrations to a named database: `local`, `branch` or `production` (ADR-049) |
| `pnpm db:whoami` | Show which database a target is and which migrations it has; no secrets printed |
| `pnpm ai:check` | Ask each test model one question with the real `GEMINI_API_KEY` from `.env.local`; prints which answer. `pnpm ai:check users` asks the models that answer users, which spends their small daily allowance (ADR-059). `pnpm ai:check receipt` sends each test model a made-up receipt photo and says whether it read the total (ADR-067) |
| `pnpm batch` | Synthetic batches: `load`, `list`, `report`, `delete`, `promote`, `rollup`; `give` and `take-back` for developer accounts (`docs/SYNTHETIC.md`) |
| `pnpm nessie` | Nessie demo customers: `seed` a synthetic year into Nessie, `link` it to a user, `status`, and live `demo` changes (`docs/NESSIE_PLAN.md`) |

Not defined yet. Add each script, and its row above, in the PR that adds the
thing it runs:

| Command | Purpose | Arrives with |
|---|---|---|
| `pnpm db:seed` | Seed synthetic demo data, including the demo Nessie customer | Demo seed (F-21) |

The agent worker is its own workspace package (ADR-032), so its scripts are
in `agent-worker/package.json`:

| Command | Purpose |
|---|---|
| `pnpm --filter agent-worker dev` | Run the worker locally, reading `agent-worker/.env` (terminal chat by default) |
| `pnpm --filter agent-worker start` | Run the worker with settings from the environment, as Render does |

Root `pnpm lint`, `pnpm typecheck` and `pnpm test:unit` cover
`agent-worker/` and `packages/` too.

Unit and E2E tests need the local database: `docker compose up -d` (host
port 5433). Tests never use the Neon database in `.env.local`. Object
storage is the one exception: storage tests use the Neon `storage-tests`
branch's bucket (ADR-053). Pull its credentials once with
`neon env pull --project-id small-tree-10245355 --branch storage-tests --file .env.storage-tests`
and add `STATEMENTS_BUCKET=statements` to that file. Tests read only the
storage variables from it, never its `DATABASE_URL`, and never use
production's bucket.

Use `pnpm` only. Never commit `package-lock.json` or `yarn.lock`.

## 6. Project structure

Entries marked *(planned)* do not exist yet; create them where shown.

```text
src/
  app/                      Next.js App Router routes only (thin)
    page.tsx                landing page (src/features/landing)
    (auth)/                 sign-in, sign-up
    (app)/                  signed-in pages
      w/[workspaceId]/      one folder per navbar link in src/config/nav.ts
                            (dashboard, accounts, …, settings) (ADR-007)
      <name>/               flat URL (/dashboard) that redirects into the
                            user's Personal workspace
    api/                    route handlers: auth, health; Plaid webhooks,
                            agent turn and job tick (planned)
  features/                 one folder per feature, owned by whoever is assigned
    <feature>/              built so far: accounts, agent, auth, bills, budgets,
                            cashflow, categorization, imports, insights,
                            landing, messaging, plans, recurring,
                            synthetic, transactions
      domain/               pure TypeScript logic, no I/O (most unit tests here)
      server/               repositories, server actions ('server-only')
      ui/                   React components for this feature
      index.ts              what other features may import
  components/ui/            shared presentational components (app-nav, page-placeholder)
  config/                   app.ts (APP_NAME), nav.ts (navbar links)
  lib/
    money/                  the only place money math happens
    db/                     Drizzle schema, client, migrations, uuidv7 ids
    auth/                   Better Auth config, roles, session, authz.ts,
                            Personal workspace on sign-up
    email/                  Resend sender and email templates; local outbox
                            without a key (ADR-052)
    storage/                statements bucket in Neon object storage, through
                            Neon's Files SDK adapter (ADR-053)
    env.ts                  zod validation of the app's environment variables
    security/               encryption, rate limiting, redaction (planned)
    ai/                     model client, placeholder filling, digit scan (planned)
  instrumentation.ts        refuses to start without the required env vars
tests/
  e2e/                      Playwright specs
  fixtures/                 synthetic data only (never real data); pdf/ has
                            the statement fixtures and their generator;
                            any private/ folder is gitignored
scripts/                    docs-check, scan-bundle, db (whoami, migrate-to),
                            batch (synthetic batches), with their unit tests
agent-worker/               Photon Spectrum relay process (pnpm workspace package, ADR-032)
packages/agent-protocol/    zod schemas shared by the worker and /api/agent/turn
docs/                       PROJECT, ARCHITECTURE, DECISIONS, HANDOFF, TESTING,
                            PITCH, SYNTHETIC
```

Features import from `lib/` and `components/ui/`, never from another feature's
`server/` or `ui/` internals. Cross-feature calls go through that feature's
exported `index.ts`.

## 7. Git and pull requests

- **Never commit, amend, push, or open a PR without the user's explicit
  permission for that specific action.** Being asked to make a change, or
  to "save" or "finish" work, is not permission to commit it. When the work
  is ready, show what changed and the commit message you propose, then wait
  for a yes. Permission given once does not carry over to later commits.
- Commit messages follow Conventional Commits: `feat(imports): add CSV column mapping`.
- One topic per branch. Open a PR into `main` using the PR template.
- Merging requires: all CI checks green, 1 approving review from a teammate,
  all review threads resolved (including CodeRabbit's), branch up to date.
  Merge method: squash.
- Schema changes: include the generated migration in the same PR and say so in
  the PR description.

## 8. Definition of done

- [ ] Code follows every rule in section 4
- [ ] Vitest tests for the domain logic, including edge cases
- [ ] Playwright test for the user-facing flow
- [ ] Authorization test if the change touches data access
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:e2e` pass locally
- [ ] Relevant docs updated (new ADR if a decision was made)
- [ ] HANDOFF entry appended

## 9. End of every session

Append a new entry to `docs/HANDOFF.md` using its template (what changed,
what's next, open problems). Do this even if the session ended early or the
work is unfinished.

### Reserved numbers

Each developer numbers new ADRs and handoff entries from their own block
(ADR-084), so two open branches never take the same number. Numbers up to
ADR-061 and HO-054 were shared and are all used. Use the lowest unused
number in the block of the developer you are working for (the git user, or
ask). Gaps
inside a block are expected; `pnpm docs:check` allows them and fails on a
number outside every block. When a block is full, add the next 20 numbers
after the highest block to this table, in their own commit.

| Developer | ADR numbers | HO numbers |
|---|---|---|
| Muhammad Tahub Khatri | 062–081 | 055–074 |
| Jacob Heminway | 082–101 | 075–094 |
| Simon Ormond | 102–121 | 095–114 |
| Muhammad Tahub Khatri (second block) | 122–141 | 115–134 |

ARCH and TEST sections are rarely added and stay shared: take the next
number after the highest one on `main`.

## 10. Team

Three people, each working with coding agents and assigned by **feature or
bug**, not by stack layer: Muhammad Tahub Khatri, Jacob Heminway, Simon Ormond.
Current assignments live in `docs/HANDOFF.md`. If you are unsure who owns
something, ask the user rather than guessing.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
