# DECISIONS

Architecture Decision Records: what the team decided and what follows from it.

This file was consolidated on 2026-10-10, at the start of hacking, so that
each record states the decision as it stands today. The decisions themselves
did not change. Numbers were kept so existing references still work.

**Retired numbers, never reused:** ADR-016 and ADR-017 (the aquarium, replaced
by ADR-042) and ADR-039 (free-tier Gemini limits, replaced by ADR-040).

## How to use this file

| Status | Meaning for agents |
|---|---|
| Accepted | Confirmed by the team. Follow it. |
| Proposed | Recommended and awaiting team confirmation. Follow it as the plan, but confirm with the user before work that is expensive to reverse. |
| Superseded by ADR-xxx | No longer applies. Follow the newer record. |

Rules:
- From here on, never edit the Decision of an Accepted ADR. Write a new ADR
  that supersedes it and change only the old one's status line.
- New ADRs take the next free number after the highest in the Index. Use the
  template at the bottom.
- When the team confirms a Proposed ADR, change its status to Accepted and add
  the date.

## Index

| ADR | Title | Status |
|---|---|---|
| ADR-001 | Product scope: everyday personal finance | Accepted |
| ADR-002 | Product name Reeflect; single `APP_NAME` constant | Accepted |
| ADR-003 | Next.js App Router, TypeScript strict, pnpm | Accepted |
| ADR-004 | Hosting on Vercel | Accepted |
| ADR-005 | PostgreSQL (Neon) with Drizzle ORM | Accepted |
| ADR-006 | Better Auth for authentication | Accepted |
| ADR-007 | Workspaces: Personal and Household, with roles | Accepted |
| ADR-008 | Money as integer cents; USD only | Accepted |
| ADR-009 | Data sources share one transaction shape | Accepted |
| ADR-010 | Import guardrails: identity, duplicates, reconciliation | Accepted |
| ADR-011 | PDF statement parsing pipeline | Superseded by ADR-044 |
| ADR-012 | Bank linking through Plaid; no raw credentials | Accepted |
| ADR-013 | Categorization by keyword rules with manual override | Accepted |
| ADR-014 | Recurring charge detection | Superseded by ADR-058 |
| ADR-015 | Calendar-month budgets; preset editable categories | Accepted |
| ADR-018 | Themes, accessibility, responsive design | Accepted |
| ADR-019 | AI features; AI never produces numbers | Accepted |
| ADR-020 | Transfers and card payments are not spending | Accepted |
| ADR-021 | Git workflow, branch protection, CI | Accepted |
| ADR-022 | AGENTS.md as the agent instruction source | Accepted |
| ADR-023 | Testing policy | Accepted |
| ADR-024 | Debt and credit tab; no real credit scores | Accepted |
| ADR-025 | Data retention, deletion, audit log | Accepted |
| ADR-026 | End-of-month forecast | Accepted |
| ADR-027 | Frontend previews for features not built in time | Accepted |
| ADR-028 | Revenue model: freemium plus licensing to banks | Accepted |
| ADR-029 | No project work before the hacking window | Accepted |
| ADR-030 | Bill due-date reminders | Accepted |
| ADR-031 | iMessage agent built on Photon Spectrum | Accepted |
| ADR-032 | Agent architecture: thin worker plus Next.js brain | Accepted |
| ADR-033 | Capital One Nessie as a data source | Accepted |
| ADR-034 | Phone linking, agent identity, judge demo flow | Accepted |
| ADR-035 | Agent number rules (refines ADR-019) | Proposed |
| ADR-036 | Prize tracks entered | Accepted |
| ADR-037 | MVP scope and build order | Superseded by ADR-043 |
| ADR-038 | Proactive messages: opt-in, quiet hours, lock-screen privacy | Accepted |
| ADR-040 | Gemini used without tier-driven limits | Accepted |
| ADR-041 | Keeping the Render worker awake; worker as the job clock | Accepted (job clock Proposed) |
| ADR-042 | Cash-flow calendar is the home screen | Accepted (six sub-items Proposed) |
| ADR-043 | HackNC scope and build order | Accepted |
| ADR-044 | Statement parsing: CSV and PDF, by code only | Accepted |
| ADR-045 | Gemini summary on the website (refines ADR-019) | Accepted |
| ADR-046 | Styling: plain CSS first, Tailwind as a fallback | Accepted |
| ADR-047 | Better Auth Infrastructure dashboard | Proposed |
| ADR-048 | Nessie as it behaves today (refines ADR-033) | Proposed |
| ADR-049 | Synthetic data batches and the batch-testing branch | Accepted |
| ADR-050 | Manual transactions and the typed balance | Proposed |
| ADR-051 | Phone linking: six digits, approved on the website (refines ADR-034) | Proposed |
| ADR-052 | Email through Resend; verified email required | Proposed |
| ADR-053 | Statement CSVs in Neon object storage (refines ADR-025) | Proposed |
| ADR-054 | CSV import: Capital One exports in built-in formats (refines ADR-044) | Proposed |
| ADR-055 | Retirement and investing count as saving, not spending (refines ADR-020) | Proposed |
| ADR-056 | Insights: compare with sample people (refines ADR-049) | Proposed |
| ADR-057 | More preset categories; sample people arrive categorized (refines ADR-015) | Proposed |
| ADR-058 | Recurring payment patterns, confirmation and variable bills | Accepted |
| ADR-060 | Sample years in the developers' own accounts (exception to ADR-049) | Accepted |
| ADR-061 | Ask the user to categorize large uncategorized payments (refines ADR-055, ADR-057) | Proposed |

---

## Product

### ADR-001: Product scope

- **Status:** Accepted (2026-10-06)
- **Context:** An earlier idea (a brokerage-fee analyzer) was rejected as too
  enterprise- and investing-focused. The team wants a tool for everyday people
  to manage money and see where they stand.
- **Decision:** Build a personal-finance app for individuals and households.
  Exact numbers are always on screen. Investing, trading, advice and money
  movement are out of scope.
- **Consequences:** Every feature must serve "understand and manage my
  everyday money." Requests outside that scope are declined or logged as
  future ideas, not built.

### ADR-002: Product name

- **Status:** Accepted (2026-10-06)
- **Decision:** The product is named **Reeflect**. The name lives in one
  constant, `APP_NAME = "Reeflect"` in `src/config/app.ts`; no other file
  hard-codes it. The hackathon domain is the free Vercel project subdomain.
- **Trademark finding (2026-10-06):** A USPTO search found a live registered
  mark, "REEFLECT GLASS PROTOTYPING EXPERTS" (registration 7135033), in
  classes 012, 021, 040 and 042. Class 042 covers technology and design
  services, which can include software. Finance apps usually register in
  classes 009 and 036, which that mark does not cover.
- **Consequences:** Low risk for the hackathon. Before any public launch or
  trademark filing, get a trademark attorney's opinion and be ready to rename.
  Renaming is a one-line change plus assets.

### ADR-028: Revenue model

- **Status:** Accepted (2026-10-06)
- **Context:** Plaid's developer policy prohibits selling or renting end-user
  data obtained through Plaid to any third party, including indirectly.
- **Decision:** Two revenue streams:

| Stream | What | Notes |
|---|---|---|
| Freemium subscription | Free: one personal workspace with manual, CSV and PDF imports. Paid: bank linking, household workspaces, forecast, AI features | Plaid charges per connected bank, so bank linking sits in the paid tier |
| Licensing ("white label") | Banks and credit unions put Reeflect in front of their own customers | Pitch angle for sponsor judges |

  A possible later stream, not built and not pitched as built: opt-in,
  anonymized, aggregate spending trends from data users upload themselves
  (never Plaid data), only after legal review.
- **Consequences:** Feature flags must be able to mark features as paid later.
  No billing is built for the hackathon. Plaid data is never sold or shared
  for marketing.

### ADR-036: Prize tracks entered

- **Status:** Accepted (2026-10-06)
- **Decision:** Enter **Beginner/General**, **Photon AI Agent Track**,
  **Best Use of Nessie with Capital One**, and **MLH Best Use of Gemini API**.
  Not entering Frutiger Aero or MLH Best .Tech Domain. HackNC awards at most 4
  prizes per team.
- **Consequences:** The demo and the Devpost write-up must clearly show
  Spectrum, Nessie and Gemini in use (PITCH.md).

### ADR-037: MVP scope and build order

- **Status:** Superseded by ADR-043
- **Decision:** Priorities in PROJECT.md section 5 are:
  - **P0:** sign-in, personal workspace, accounts, manual entry, CSV, Nessie
    import and sync, categorization, budgets, subscriptions, the calendar and
    drill-down, demo seed, delete data, themes and accessibility, quiet hours,
    the judge demo, and the agent core: worker, phone linking, "how am I
    doing?", subscription alerts, logging spending by text, category and
    balance questions.
  - **P1:** Plaid, bill reminders, forecast, savings goal, receipt photos,
    weekly recap, audit log.
  - **Preview or P2:** PDF import, household workspace and group chats, debt
    tab, monthly recap, AI insights on the website.
  - **Three lanes:** A Data (Nessie → snapshot), B Web (calendar and pages),
    C Agent (worker, brain, images). Milestones are in HANDOFF.md.
- **Consequences:** Features outside P0 that are not finished become previews
  (ADR-027).

### ADR-043: HackNC scope and build order

- **Status:** Accepted (2026-10-10), decided by Muhammad during the hacking
  window. Supersedes ADR-037.
- **Context:** ADR-037 spread the weekend across many features and left PDF
  statements as a preview. The team now wants the main product working first
  and everything else added only if time allows.
- **Decision:**
  - **P0, build first.** Four areas, plus the foundations they need:

| Area | Features | ADRs |
|---|---|---|
| Calendar UI | Calendar home screen, drill-down, themes and accessibility | ADR-042, ADR-018 |
| Bank statement parsing | CSV import and PDF import, equally, with the import guardrails; categorization; transfer pairing; recurring detection | ADR-044, ADR-010, ADR-013, ADR-020, ADR-014 |
| Nessie | Connect the Capital One sandbox, sync, demo seed | ADR-033 |
| iMessage agent | Worker, phone linking, "how am I doing?", subscription alerts, logging spending by text, category and balance questions, quiet hours, judge demo | ADR-031, ADR-032, ADR-034, ADR-035, ADR-038, ADR-040, ADR-041 |
| Foundations | Sign-in, personal workspace, financial accounts, manual transactions, delete data | ADR-005, ADR-006, ADR-007, ADR-008, ADR-025 |

  - **P1, build next, in this order:** subscriptions keep / planning to
    cancel marks (ADR-014, ADR-030); the budgets page (ADR-015); bill due-date
    reminders (ADR-030); the Gemini summary on the website (ADR-045).
  - **Later, only if time remains after P1:** Plaid (ADR-012), household
    workspaces and group chats (ADR-007, ADR-034), the debt and credit tab
    (ADR-024), the savings goal, receipt photos (ADR-035), the weekly recap
    text, the end-of-month forecast (ADR-026), the audit log (ADR-025), the
    monthly recap and Google sign-in. Their ADRs stay Accepted as the plan
    for when they are built.
  - A Later feature may be shown as a preview under ADR-027, but none is
    required.
  - **Three lanes** stay as in HANDOFF.md: A Data, B Web, C Agent.
- **Consequences:** PDF import is built for real, so its fixtures and tests
  (TEST-04, TEST-07) are required this weekend. Until the budgets page
  exists, the agent's confirmation after logging spending leaves out the
  category's remaining budget. PROJECT.md section 5 carries these priorities.

### ADR-042: Cash-flow calendar is the home screen

- **Status:** Accepted (2026-10-07), confirmed by Muhammad after reviewing
  mockups. The numbered items under "Proposed" await team confirmation.
- **Context:** An aquarium that pictured the user's finances was mocked up
  three times before the event and dropped: the fish read as childish for a
  finance product, and more abstract shapes lost their meaning. The people we
  most want to reach are not confident with money; they need plain answers
  more than a metaphor. A calendar answered "what can I spend?" and "what is
  coming?" directly.
- **Decision (Accepted):**
  - The web app's home screen is a cash-flow calendar. There is no aquarium
    anywhere in the product.

| Part | Shows | Text on screen |
|---|---|---|
| Headline | What the user can spend per day until the next payday | "You can spend about $X a day until payday", with the sum behind it: balance today − owed before payday = yours to spend |
| Month calendar | Each day's activity by name: money in, bills, subscriptions, day-to-day spending; a day total; a bar for how heavy the day's spending was | Item names and amounts; a mark shape per kind (triangle, square, circle, bar) |
| Balance line | Balance day by day: solid up to today, dotted for what is expected | Selected day and its balance |
| Day panel | The selected day's items, where each came from (bank, added by the user, texted in), money in, money out, balance | All amounts exact |
| Filters and layouts | Show one kind at a time; switch between calendar and list | Labelled buttons |
| Subscriptions | Monthly and yearly cost; keep / planning to cancel; what a year without the marked ones would save | "$X a month, $Y a year" |
| No-spend day | A past day when nothing went out | "No-spend day" |

  - No shame mechanics: no alarms, no guilt copy, no failure states.
  - Every visual state has a text equivalent. Colour is never the only signal.
  - Every number on screen comes from pure functions in
    `src/features/cashflow/domain/`. Client components do no money math.
  - Rendering: HTML and CSS, with Motion for small transitions and inline SVG
    for the balance line. No raster art, no AI-generated art.
- **Decision (Proposed):**
  1. **Headline formula.** `perDay = floor(max(0, B − D) / N)`, where B is the
     liquid balance today, D is the total of bills and subscriptions due
     before the next payday, and N is the number of days until that payday (at
     least 1). The next payday is the next expected recurring income. With no
     expected income, the headline shows the balance only.
  2. **Agent image.** "How am I doing?" and the weekly recap attach an image
     of the next 7 days of the calendar.
  3. **Product line.** "Reeflect lives in your texts; the calendar shows
     what's coming."
  4. **Budgets.** The home screen does not use category budgets. Budgets
     (ADR-015) stay as their own page, and "how am I doing?" answers with
     balance, what is owed before payday, and the per-day amount.
  5. **Savings goal.** One line on the home screen with progress toward the
     goal.
  6. **Forecast.** ADR-026's formula is drawn as the dotted part of the
     balance line.
- **Alternatives considered:** the aquarium with abstract shapes (rejected
  after two rounds); a plain budget dashboard (familiar but not memorable); a
  money-flow diagram (striking, but explains the past rather than what to do
  next).
- **Consequences:** Recurring income must be detected as well as recurring
  charges, because the headline depends on the next payday; ADR-014 covers
  charges only, so this rule is still to be written. The name Reeflect stays
  (ADR-002), although its reef pun no longer has a visual to point at.

---

## Platform

### ADR-003: Framework and language

- **Status:** Accepted (2026-10-06)
- **Decision:** Next.js App Router, TypeScript in strict mode, pnpm, ESLint +
  Prettier. One codebase for UI and server (server actions and route
  handlers).
- **Consequences:** No separate backend service, except the agent worker
  (ADR-032). Long-running work must fit serverless limits.

### ADR-004: Hosting

- **Status:** Accepted (2026-10-06)
- **Decision:** Deploy on Vercel, with a preview deployment per pull request.
- **Consequences:** The database is an external managed service (ADR-005).
  Serverless functions need a pooled database connection.

### ADR-005: Database and ORM

- **Status:** Accepted (2026-10-06)
- **Decision:** PostgreSQL on Neon (free tier, pooled connection string),
  accessed only through Drizzle ORM. Schema in `src/lib/db/schema/`.
  Migrations are generated by `drizzle-kit generate`, applied by
  `drizzle-kit migrate`, and committed with the PR that changes the schema.
  Local development and CI use PostgreSQL in Docker.
- **Alternatives considered:** MariaDB (harder to host with Vercel, unfamiliar
  to the team); SQLite (poor fit for multi-user serverless hosting).
- **Consequences:** Use Drizzle's `pg-core` column types. Money columns are
  `bigint` with `mode: 'number'` (ADR-008).

### ADR-006: Authentication

- **Status:** Accepted (2026-10-06)
- **Decision:** Better Auth with the Drizzle adapter. Email and password in
  P0; Google sign-in in P2. Sessions use secure, HTTP-only cookies managed by
  Better Auth.
- **Consequences:** Better Auth owns a table named `account` for login
  providers, so bank and card accounts use the table name
  `financial_account`.

### ADR-047: Better Auth Infrastructure dashboard

- **Status:** Proposed (2026-10-10), proposed by Simon
- **Context:** Better Auth (ADR-006) runs inside the app and keeps users and
  sessions in our database, so there is nowhere to watch sign-ups, sign-ins
  and sessions without querying the database. Better Auth sells a hosted
  dashboard, Better Auth Infrastructure, that shows this activity.
- **Decision:**
  - Connect the app to Better Auth Infrastructure with the `dash()` server
    plugin and `dashClient()` from `@better-auth/infra`.
  - The key is `BETTER_AUTH_API_KEY`, optional. Without it the server plugin
    is left out, so local tests, CI and Playwright never call the service
    (Playwright sets it to empty).
  - Activity tracking (`lastActiveAt`) stays off, so the user table does not
    change. `sentinel()` (paid plan) is not used.
- **Alternatives considered:** Querying the `user` and `session` tables in
  the Neon console or Drizzle Studio; no new vendor, but no activity history.
- **Consequences:** A new external vendor. Auth events about real users
  (user ids, emails, sign-in times, IP-based location, user agent) are sent
  to dash.better-auth.com. No financial data is sent. Confirm with the team,
  and check Better Auth's data handling, before production users sign up.
  Removing it is one plugin and one variable.

### ADR-052: Email through Resend; verified email required

- **Status:** Proposed (2026-10-10), proposed by Simon
- **Context:** Sign-up (ADR-006) accepts any email address without checking
  it, and a forgotten password cannot be reset. Both need an email service.
  The team has verified a sending domain with Resend.
- **Decision:**
  - **Provider:** Resend, through the `resend` SDK, called only from a
    server-only module, `src/lib/email/`. Nothing else imports `resend`.
  - **Variables:** `RESEND_API_KEY` (secret) and `EMAIL_FROM` (a sender on
    the verified domain, e.g. `Reeflect <no-reply@…>`; the name comes from
    `APP_NAME`). Both are required when `VERCEL` is set (production and
    previews). Elsewhere both are optional, but a key without a sender is
    refused.
  - **Without a key** (local, CI, Playwright), emails are not sent. Each
    one is written as a JSON file to a gitignored outbox folder
    (`.email-outbox/`), so Playwright can follow the link inside it. The
    app never writes the outbox when `VERCEL` is set.
  - **Verification is required for new users.** Better Auth
    `requireEmailVerification: true`, `sendOnSignUp: true`,
    `sendOnSignIn: true` (an unverified user who tries to sign in gets a
    fresh link), `autoSignInAfterVerification: true`. Links expire after
    one hour. Sign-up shows "check your inbox" with a button to resend.
  - **Password reset** by email: `sendResetPassword`, with
    `revokeSessionsOnPasswordReset: true`. The request page says the same
    thing whether or not the address has an account.
  - **Every existing user is verified once:** custom Drizzle migration
    `0004_verify_existing_users`
    runs `UPDATE "user" SET "email_verified" = true`. It applies to the
    users present when each database migrates, and does nothing afterwards.
    The migration runs on production **before** the code that requires
    verification is deployed, so nobody is locked out.
  - **Sending does not block the response.** Auth callbacks start the send
    and do not `await` it, so response times do not reveal which addresses
    have accounts. A failed send is logged with the user id and Resend's
    error name only.
  - **What emails may contain:** the app name, a greeting and the link.
    Never amounts, balances, account names or any other financial data.
    Never log verification or reset URLs, tokens, or email bodies; log
    Resend's message id.
  - Better Auth's built-in rate limits (database storage, ARCH-08) cover
    the send-verification and reset endpoints.
- **Alternatives considered:**
  - No verification: anyone can sign up with someone else's address, and
    there is no password reset.
  - Better Auth's email OTP plugin: codes instead of links. More UI to
    build for the same result.
  - Postmark or Amazon SES: equivalent, but no domain is set up there.
- **Consequences:**
  - A new external vendor. Resend receives users' email addresses and the
    one-time links; no financial data. The free tier allows 100 emails a
    day and 3,000 a month, enough for the MVP.
  - Sign-up no longer signs the user in straight away. The Playwright
    sign-up flow and `tests/e2e/auth.setup.ts` must verify through the
    outbox; users seeded for tests are created already verified.
  - Household invites stay copyable links (ADR-007); emailing invites
    would be a later ADR.
  - Docs: ARCHITECTURE's environment table, `.env.example`, `src/lib/env.ts`.
  - Removing Resend means setting `requireEmailVerification` back to false
    and dropping one module and two variables. The backfill cannot be
    undone, and does not need to be.

### ADR-007: Workspaces and roles

- **Status:** Accepted (2026-10-06)
- **Decision:**
  - Every user gets a **Personal** workspace on sign-up (single member).
  - Users can create **Household** workspaces and invite members by a
    copyable invite link (no email service in the MVP).
  - Roles: `owner` (manage members, delete workspace), `editor` (add and edit
    data, import), `viewer` (read only).
  - Implemented with Better Auth's organization plugin; a workspace is an
    organization.
  - Each financial account belongs to exactly one workspace. A personal
    account stays private unless the user creates it in, or moves it to, the
    household workspace.
  - The active workspace id is in the URL (`/w/[workspaceId]/...`) and is
    re-checked on the server for every request.
- **Consequences:** Every financial table has `workspace_id`. A
  cross-workspace read is a critical security bug and is tested on every
  route (TEST-06).

### ADR-008: Money representation and currency

- **Status:** Accepted (2026-10-06)
- **Decision:**
  - Money is integer cents. Database: `bigint`, Drizzle `mode: 'number'`.
    TypeScript: branded type `Cents`. All values must satisfy
    `Number.isSafeInteger`.
  - All money operations live in `src/lib/money`: parse, add, subtract,
    multiply by a ratio with explicit rounding (round half to even), split
    without losing cents, compare, format as USD.
  - Sign convention: positive = into the account, negative = out of the
    account, for every account type.
  - USD only. Imports in any other currency are rejected with a clear message.
- **Consequences:** No floating-point money anywhere. A lint rule or code
  review flags `parseFloat`, `toFixed`, `* 100` and `/ 100` outside
  `src/lib/money`.

### ADR-018: Themes, accessibility, responsive design

- **Status:** Accepted (2026-10-06)
- **Decision:** Light and dark themes from the same tokens. WCAG 2.2 AA
  contrast. `prefers-reduced-motion` turns transitions off and shows state
  statically. Every visual state has a text label. Layouts work from 360px
  phones to wide desktops.
- **Consequences:** Playwright runs axe accessibility checks and a
  reduced-motion run (TEST-07).

### ADR-046: Styling: plain CSS first, Tailwind as a fallback

- **Status:** Accepted (2026-10-10), decided by Muhammad
- **Context:** Three people build with coding agents, and no single agent
  holds the whole design. Utility classes scattered through components would
  let each agent pick its own colours and spacing. `create-next-app`
  installed Tailwind v4.
- **Decision:**
  - Styling is plain CSS. Design tokens (colours for both themes, spacing,
    type sizes, radii) are CSS custom properties in `src/app/globals.css`.
  - Component styles are CSS Modules next to the component
    (`Thing.module.css`) and use the tokens, not literal colours or sizes.
  - Tailwind stays installed as a fallback. A Tailwind utility may be used on
    one specific element when plain CSS would be clearly worse. It is never a
    component's main styling, and it never introduces a colour or size that
    is not a token.
- **Consequences:** An agent can style a component correctly from
  `globals.css` alone. The starter page from `create-next-app` still uses
  Tailwind classes and is replaced by the calendar home screen (ADR-042).

---

## Data and imports

### ADR-009: Data sources

- **Status:** Accepted (2026-10-06)
- **Decision:** Five sources, all producing the same internal transaction
  shape: manual entry, CSV upload, PDF statement upload, Plaid (ADR-012) and
  Capital One's Nessie sandbox (ADR-033). Every non-manual source creates an
  `import_batch`.
- **Consequences:** Downstream features (categorization, budgets, the
  calendar) never care which source a transaction came from.

### ADR-010: Import guardrails

- **Status:** Accepted (2026-10-06)
- **Context:** Data from one account must never be mixed into another, and
  PDFs must be checked against the account the user says they belong to.
- **Decision:** Every import goes through these checks before commit:

| Check | CSV | PDF | Aggregator | On failure |
|---|---|---|---|---|
| Target account chosen by user | Required | Required | Set by link | Block |
| Identity match: institution name and last 4 digits match the target account | Only if present in file | Required | Implicit | Block, show both values, let the user pick the right account |
| First import to a new account: user confirms extracted identity | Yes | Yes | No | Block until confirmed |
| Account type compatibility (e.g. card statement into a checking account) | Heuristic | Required | Implicit | Block |
| Currency is USD | Required | Required | Required | Block |
| Duplicate file (same SHA-256 already imported to this account) | Required | Required | n/a | Block with message |
| Duplicate transactions: fingerprint = account + date + amount + normalized description + occurrence index | Required | Required | Use aggregator transaction id | Skip duplicates, show count |
| Period overlap with earlier imports | Required | Required | n/a | Dedupe by fingerprint, show overlap |
| Period gap since last import | Warn | Warn | n/a | Warn, allow |
| Balance reconciliation: opening + sum of transactions = closing, to the cent | If running balance column exists | Required | n/a | Block commit; show the difference |
| Running-balance continuity with previous import | If present | Required | n/a | Warn |

- **Consequences:** Imports run in two steps: `preview` (parse and check, no
  writes) and `commit` (writes inside one database transaction). Nothing is
  written if any blocking check fails.

### ADR-011: PDF statement parsing

- **Status:** Superseded by ADR-044
- **Decision:**
  1. Accept only `application/pdf` with valid magic bytes, ≤ 10 MB, ≤ 50
     pages. Reject encrypted or image-only PDFs with a clear message.
  2. Extract the text layer with word positions on the server (Node runtime).
  3. Parse with a per-institution template (anchors such as "Beginning
     Balance"). The first version ships one institution's layout.
  4. Later fallback for unknown layouts: an AI model receives word ids and
     text and returns which ids hold which fields. Values are always read from
     the text by code (ADR-019).
  5. Run the import guardrails (ADR-010), including mandatory reconciliation.
  6. Delete the raw file after extraction; keep only its SHA-256 (ADR-025).
- **Consequences:** Unsupported layouts fail clearly rather than guess. Each
  template is covered by synthetic fixture PDFs in `tests/fixtures/pdf/`.

### ADR-044: Statement parsing: CSV and PDF, by code only

- **Status:** Accepted (2026-10-10), decided by Muhammad. Supersedes ADR-011. Its CSV pipeline is refined by ADR-054
- **Context:** ADR-011 left PDF import as a preview and planned an AI
  fallback for unknown layouts. Statement parsing is now one of the four main
  features (ADR-043), and the team wants every number to be read by code.
- **Decision:**
  - CSV and PDF statement import are both built for real, with equal
    priority. Both run in Next.js on the server (Node runtime).
  - **No AI takes part in parsing.** Code extracts every date, description,
    amount and balance. Gemini only sees the resulting numbers afterwards,
    under ADR-019 and ADR-045.
  - **PDF pipeline:**
    1. Accept only `application/pdf` with valid magic bytes, ≤ 10 MB, ≤ 50
       pages. Reject encrypted or image-only PDFs with a clear message.
    2. Extract the text layer with word positions.
    3. Parse with a per-institution template (anchors such as "Beginning
       Balance"). The first template is for **Capital One** statements, to
       match the Nessie track (ADR-036). Other banks come later.
    4. Emit the same normalized rows a CSV import produces (ADR-009), so
       everything after parsing is shared. Gemini is given data derived from
       those rows, never the PDF itself.
    5. Run the import guardrails (ADR-010), including mandatory balance
       reconciliation.
    6. Delete the raw file after extraction; keep only its SHA-256 (ADR-025).
  - **CSV pipeline:** as ADR-010 and ARCH-05 describe: the user maps columns
    once per institution, then the same guardrails run.
- **Alternatives considered:** Gemini locating fields for code to read (works
  on more banks, but adds a model to the path that produces numbers); Gemini
  extracting transactions directly (breaks ADR-019).
- **Consequences:** A statement from an unsupported bank fails clearly rather
  than guessing. Each template is covered by synthetic fixture PDFs in
  `tests/fixtures/pdf/` (TEST-08). Supporting another bank means writing
  another template.

### ADR-012: Bank linking through Plaid

- **Status:** Accepted (2026-10-06). Built later (ADR-043).
- **Decision:**
  - Users authenticate with their bank inside Plaid Link (Plaid's own UI). The
    app never sees, stores or transmits bank credentials.
  - **Environments:**

| Environment | Data | Use |
|---|---|---|
| Sandbox | Test institutions; default login `user_good` / `pass_good` | Development, nightly CI tests, the live demo |
| Trial plan (free; up to 10 real connections) | Real bank data | Private testing by team members only; never on stage, never in fixtures |
| Production (paid) | Real data | Out of scope for the hackathon |

  - **Products:** Transactions. Liabilities for the debt tab (P2). Plaid's
    recurring-transactions data is an extra signal for ADR-014, not a
    replacement.
  - **Flow:** see ARCH-11.
  - **Security:**
    - Access tokens are encrypted with AES-256-GCM, key from
      `ENCRYPTION_KEY`; never sent to the browser, never logged.
    - Plaid client id and secret are server-only environment variables.
    - Webhooks are verified before any processing; unverified webhooks are
      rejected without writes.
    - Only `editor` or `owner` roles can link or unlink banks.
    - Unlinking calls Plaid to remove the item, then deletes the stored token.
  - **Data mapping:** Plaid amounts are converted to integer cents and to our
    sign convention (ADR-008) in one tested function. Plaid transaction ids
    become `external_id` and drive de-duplication (ADR-010).
- **Consequences:** A Plaid outage must not break the other sources.
  Plaid-dependent E2E tests are tagged `@external` and run nightly. The
  client SDK is loaded only on pages that link banks.

### ADR-013: Categorization

- **Status:** Accepted (2026-10-06)
- **Decision:** Keyword rules match the normalized merchant name (lowercased,
  store numbers and reference codes stripped). Match types: `contains`,
  `starts_with`, `exact`; the highest priority wins. The user can override
  any transaction's category and optionally save the override as a rule.
  Unmatched transactions go to "Uncategorized".
- **Consequences:** AI suggestions (ADR-019) only propose rules; a user must
  confirm before a rule is created.

### ADR-014: Recurring charge detection

- **Status:** Superseded by ADR-058
- **Context:** "Same merchant seen more than twice" alone would turn regular
  grocery or coffee visits into subscriptions.
- **Decision:** A merchant becomes a recurring series when all of these hold:
  1. Same normalized merchant on the same account, at least 3 charges in the
     last 120 days.
  2. Consecutive charges are 25–35 days apart (monthly) or 6–8 days apart
     (weekly).
  3. Each amount is within ±15% of the series median.

  A price change beyond ±15% on an existing series is flagged as a price
  change rather than breaking the series. Aggregator-provided recurring data
  is an extra signal, not a replacement. Users can mark a merchant as
  recurring by hand.
- **Consequences:** Some subscriptions appear only after their third charge.
  Agents must not implement the looser "same merchant more than twice" rule.
  ADR-030 splits a series into `subscription` or `bill`.

### ADR-015: Budgets and categories

- **Status:** Accepted (2026-10-06)
- **Decision:** Budgets are per category per calendar month, in the
  workspace's time zone. Workspaces start with 6–8 preset categories the user
  can rename.
- **Consequences:** A budget change applies to the current month from the
  moment it is saved; earlier months keep their budgets. Budgets have their
  own page and are not on the home screen (ADR-042, Proposed item 4).

### ADR-020: Transfers and credit-card payments

- **Status:** Accepted (2026-10-06)
- **Context:** With checking and a credit card both linked, a card purchase is
  spending, and the later payment from checking to the card would be counted
  again.
- **Decision:** Two transactions in the same workspace are paired as a
  transfer when their amounts are equal and opposite, they are on different
  accounts, and their dates are within 3 days. Card payments are transfers.
  Aggregator transfer categories are an extra signal. Paired transfers are
  excluded from spending, income and budgets. Users can unpair, or mark a
  transaction as a transfer by hand. Money sent to accounts outside the
  workspace counts as spending unless the user marks it.
- **Consequences:** Spending totals are correct across linked accounts.
  Pairing logic has dedicated unit tests.

### ADR-024: Debt and credit tab

- **Status:** Accepted (2026-10-06). Built later (ADR-043).
- **Decision:** A separate tab shows credit cards and loans: balance, APR,
  minimum payment, due date. Data comes from Nessie loans, Plaid Liabilities
  in sandbox, or mock data. A credit score, if shown, is mock data labelled
  "Sample", because real scores require credit-bureau agreements.
- **Consequences:** Debt does not change the liquid balance, which is checking
  plus savings only.

### ADR-025: Data retention, deletion, audit log

- **Status:** Accepted (2026-10-06); its file storage consequence is refined by ADR-053
- **Decision:**
  - Raw uploaded files are deleted right after extraction; the SHA-256 is kept
    for duplicate detection.
  - Deleting a financial account deletes its transactions and import batches.
    Deleting a workspace deletes everything in it and revokes its aggregator
    connections.
  - Security-relevant events are written to `audit_event` (P1): sign-in,
    invite created or accepted, role change, import committed, bank or phone
    linked or unlinked, deletions. Audit rows contain ids, not financial
    details.
- **Consequences:** No file storage bucket is needed in the MVP.

### ADR-026: End-of-month forecast

- **Status:** Accepted (2026-10-06). Built later (ADR-043).
- **Decision:** Projected month-end liquid balance =
  current liquid balance
  \+ expected recurring income not yet received this month
  − expected recurring bills not yet paid this month
  − (average daily discretionary spending so far this month × days left).
  It is drawn as the dotted part of the calendar's balance line and labelled
  "Estimate: $X by month end." Deterministic; no AI.
- **Consequences:** Depends on recurring detection (ADR-014). Early in a month
  with little data, the label says the estimate is rough.

### ADR-030: Bill due-date reminders

- **Status:** Accepted (2026-10-06). Priority P1 (ADR-043).
- **Context:** Users should be reminded before recurring obligations such as
  car payments and mortgages are due. These are obligations with due dates,
  not optional spending.
- **Decision:**
  - **Two kinds of recurring series.** `recurring_series.kind` is
    `subscription` or `bill`. Series in the Housing, Transportation/Loans,
    Utilities or Credit-card-payment categories, or linked to a loan or
    credit-card liability, default to `bill`; everything else defaults to
    `subscription`. The user can change the kind. Only bills get reminders.
  - **Users can add a bill by hand** (name, amount, due day, account), so
    reminders work before three charges have been seen.
  - **Due-date sources, most trusted first:**

| Source | Example | Label shown |
|---|---|---|
| Lender data | Plaid Liabilities next payment due date; Nessie bills | "Due October 15" |
| User-entered | Manual bill or user correction | "Due October 15" |
| Predicted | Last charge date + the series' usual interval | "Expected around October 15" |

  - **Month-end rule:** a bill due on the 29th, 30th or 31st falls on the last
    day of shorter months.
  - **Reminder timing:** one reminder 7 days before the due date, in the
    workspace's time zone, sent once per bill per cycle.
  - **Already paid:** if a matching payment (same series, within ±15% of the
    usual amount) posts before the due date, the reminder is cancelled or not
    sent.
  - **Low balance warning:** if the liquid balance is below the amount due at
    reminder time, the reminder adds: "Your balance is $X, which is less than
    this payment."
  - **Autopay:** the user can mark a bill as autopay; the reminder then reads
    "will be withdrawn automatically" and still includes the low-balance
    warning.
  - **Copy rules:** calm and factual, no alarms or threats (ADR-042). The app
    never pays the bill (ADR-001). All amounts and dates come from code
    (ADR-019).
  - **Delivery:** an in-app "Upcoming bills" list with a notification badge,
    and an iMessage reminder under the rules of ADR-038.
- **Consequences:** Adds `kind`, due-date fields and a `reminder` table
  (ARCH-03), a scheduled job (ARCH-12, ADR-041), and tests in TEST-04 and
  TEST-07.

### ADR-033: Capital One Nessie as a data source

- **Status:** Accepted (2026-10-06)
- **Context:** Nessie is Capital One's hackathon API with mock customer,
  account, purchase, deposit, bill and loan data. It lets developers create
  purchases, simulate paychecks and schedule bills.
- **Decision:**
  - Nessie is the **primary data source for the demo**.
  - **Connection:** a "Connect Capital One sandbox" button on the accounts
    page creates a Nessie customer with checking, savings and credit-card
    accounts for that workspace and stores the Nessie customer id.
    `pnpm db:seed` also creates a rich Nessie history for the demo workspace.
  - **Mapping:**

| Nessie object | Reeflect |
|---|---|
| Account (Checking, Savings, Credit Card) | `financial_account` with `source = 'nessie'` and `nessie_account_id` |
| Purchase | Negative transaction on that account |
| Deposit | Positive transaction (income) |
| Withdrawal | Negative transaction |
| Transfer | Pair of transactions, handled by ADR-020 |
| Bill (payment amount, payment date, recurring day 1–31) | `recurring_series` of kind `bill` with a lender due date (ADR-030) |
| Loan (amount, monthly payment) | `liability` for the debt tab (ADR-024) |

  - **Money:** Nessie amounts are dollars as numbers. One function,
    `fromDollarNumber` in `src/lib/money`, converts them to cents and rejects
    values with more than two decimal places after rounding checks.
  - **Sync:** no push notifications are assumed. Sync runs on "Sync now", on
    dashboard load when the last sync is over 5 minutes old, and before the
    agent answers a question.
  - **Secrets:** Nessie takes the API key as a URL query parameter, so the
    Nessie HTTP client must redact query strings in all logs and errors.
  - The base URL and exact field names are confirmed against Nessie's own
    interactive documentation at kickoff and kept in `NESSIE_BASE_URL`.
- **Consequences:** Nessie holds sandbox data only; real data never enters it.

### ADR-048: Nessie as it behaves today (refines ADR-033)

- **Status:** Proposed (2026-10-10), from Jacob's live probe of the API.
- **Context:** ADR-033 was written from Nessie's old documentation. On
  2026-10-10 the live API at `https://api.nessieisreal.com` was probed with
  the team key, using test records that were deleted afterwards. The API has
  been rewritten since that documentation: ids are UUIDs, errors are
  validation messages, and the documentation pages (`/documentation`,
  `/openapi.json`) answer 403. What it does now:

| Question | Finding |
|---|---|
| Does Nessie come with demo data? | **No.** Data belongs to the API key, and our key held 0 customers and 0 merchants. Everything read back was something we created. There is no generate endpoint. "Mock data" in ADR-033 means data we create. |
| Back-dated transactions | Kept exactly as sent: `purchase_date` and `transaction_date` one year back were stored unchanged. Future dates and other formats (`07/12/2026`) are also accepted, so validation is ours. |
| Cents | **Dropped** on purchases, deposits, withdrawals and transfers ($12.34 → $12). Bills keep cents. |
| Balances | Fixed at whatever the account was created with. Transactions do not change them, and updates to `balance` are ignored. |
| Purchase status | Must be `pending`, `cancelled` or `completed`. A purchase created without one is accepted, but afterwards listing that account's purchases fails with 400. |
| Transfers | No payee or second account: only date, amount, status and description on one account. |
| Bills | `status: recurring`, `recurring_date`, `payment_amount` (with cents). Nessie computes `upcoming_payment_date`. |
| Deleting | `DELETE /accounts/{id}` works. Customers cannot be deleted (403). The old bulk `DELETE /data` was not tried: it would wipe everything on the key. |
| Rate limits | None seen in about 20 calls; no rate-limit headers. |

- **Decision:**
  - **Base URL:** `NESSIE_BASE_URL` is `https://api.nessieisreal.com`
    (HTTPS only; plain HTTP times out).
  - **What our Nessie client sends:**
    - `status` on every purchase, deposit, withdrawal and transfer.
    - Dates as `YYYY-MM-DD` that have already passed zod validation.
    - Whole-dollar amounts for purchases, deposits, withdrawals and
      transfers, so the copy in our database matches Nessie's.
  - **What sync does:**
    - zod-validates every response.
    - Treats a 400 on one account's list as that account's problem: log its
      id, skip it, carry on.
  - **Balances are ours.** Computed from an opening balance plus
    transactions; Nessie's `balance` is used only as the opening balance
    when the account is created.
  - **Card payments** are posted as a transfer on checking ("CAPITAL ONE CARD
    PMT") and a matching deposit-style record on the card. Sync pairs them
    under ADR-020 (equal and opposite, within 3 days).
  - **Removing a Nessie customer's data** means deleting its accounts. The
    empty customer record stays, so demo customers get names that are
    obviously synthetic.
  - **Never call `DELETE /data`.** The key is shared by the whole team.
- **Consequences:**
  - The demo seed (F-21) and the "Connect Capital One sandbox" button
    (F-23) both create their Nessie history themselves; ADR-049's generator
    supplies it in whole-dollar mode.
  - TEST-04 gains rows for the client rules above.
  - **Leftovers on the team key:** one customer ("Synthetic
    Reeflect-Q1-Probe") and one merchant ("Synthetic Grocer (Reeflect
    probe)") from the probe; they cannot be deleted.
  - **The browser SDK in `public/lib`** (commit 6525b1b) targets the old API
    shape. It does not send `status`, and it sends transfer fields that are
    now rejected.
  - **`public/lib/example.html` and `public/lib/unit_tests.html` contain a
    hard-coded Nessie API key.** The repository is public on GitHub, and
    anything in `public/` is served by every deployment. The key does not
    match the team key, so it is probably the sample key that ships with
    Capital One's SDK, but treat it as exposed (see HANDOFF.md).
  - **Update (HO-029):** `public/lib` and the `<Script>` tag that loaded it
    were deleted. The key remains in git history.

### ADR-049: Synthetic data batches and the batch-testing branch

- **Status:** Accepted (2026-10-10), decided by Jacob (schema and marker).
- **Context:**
  - **What we need:** realistic customers to build and test against, as a
    population (a mix of personas) rather than one demo user, over months of
    history.
  - **Why not Nessie:** it generates nothing (ADR-048).
  - **Why not let a language model write the transactions:** it cannot keep
    one person's rent and paycheck consistent across hundreds of rows, and
    it gets cents and signs wrong.
  - **Why replay instead of merge:** Neon branches cannot be merged back
    into production.
- **Decision:**
  - **Two stages.** An agent writes a population **spec** by following
    `docs/SYNTHETIC.md`. Deterministic, seeded code
    (`src/features/synthetic`) expands it into accounts and transactions.
    Same spec, seed and `GENERATOR_VERSION` → the same rows.
  - **Same tables as everyone else.** Each synthetic person is an ordinary
    workspace (an `organization` row) with `financial_account` and
    `transaction` rows.
  - **The marker** is a `synthetic_workspace` row (one per workspace) naming
    its `synthetic_batch`. No row = real. It is a table of ours rather than
    a column on `organization`, because Better Auth generates that table.
  - **A batch is a recipe.** `synthetic_batch` stores the spec, seed,
    generator version, span and `asOf` date. It is loaded in one database
    transaction and deleted as a unit: deleting its workspaces cascades to
    their accounts, transactions and markers. The batch row cannot be
    deleted while workspaces still point at it.
  - **Batches are tried on the Neon batch-testing branch first**, a child of
    production. The ones we keep are **promoted by replay**: the same recipe
    is loaded into production by the same code, and the generator version
    must match.
  - **The scripts:**
    - `pnpm batch` (load, list, report, delete, promote).
    - `pnpm db:whoami`: which database and which migrations.
    - `pnpm db:migrate:to`: migrate a named database.

    They always name their target and print its endpoint id. Writing to
    production needs `--target production`, `--yes`, and a matching
    `NEON_PRODUCTION_ENDPOINT_ID`.
  - **Synthetic data is never mixed with real data.** It is never counted in
    real users' figures. Anything shown from it is labelled "Sample"
    (ADR-024's convention), and its workspace names start with
    "Sample · ".
- **Consequences:**
  - **New tables** (migration `0002_synthetic_batches`): `synthetic_batch`,
    `synthetic_workspace`, plus the first `financial_account` and
    `transaction` tables from ARCH-03.
  - **Generator changes** that alter output must bump `GENERATOR_VERSION`.
    Old batches then replay only from a matching checkout.
  - **A cross-workspace insights page** over synthetic batches needs its own
    ADR before it is built.

### ADR-050: Manual transactions and the typed balance

- **Status:** Proposed (2026-10-10)
- **Context:** A manual account's balance is what the person typed, dated
  `balance_as_of` (F-03). Manual transactions (F-04, and later F-27's
  "12 lunch") must keep that balance right without a schema change, and
  without counting twice what the typed balance already holds.
- **Decision:**
  - **The balance rule.** A manual transaction moves its account's stored
    balance when the account is manual and the transaction is dated on or
    after `balance_as_of`. One dated earlier is already inside the typed
    balance and moves nothing. Synced accounts (Nessie, Plaid) keep the
    balance their source gives them. Code: `balanceEffect` in
    `src/features/transactions/domain`.
  - **Edits and deletes** take back the old effect and apply the new one, in
    one database transaction with the account rows locked (in id order).
  - **Fingerprints.** A typed row gets `manual:<id>`, so two identical
    entries on one day (two $4 coffees) are two transactions. ADR-010's
    duplicate check is for imports and does not apply to typed rows.
  - **Imported and synced rows** (`source` other than `manual`) keep their
    account, date, amount and status; only the description and the transfer
    mark can be edited, so re-sync and re-import still match them. They can
    be deleted; their delete does not move the balance.
  - **Dates** are today or earlier, in `DEFAULT_TIME_ZONE`, and no earlier
    than 2000. Money still to come is F-22's (bills), not a transaction.
- **Alternatives considered:** Never moving the stored balance and having
  the calendar add later transactions to it. Rejected for now: every reader
  of the balance (accounts page, calendar, agent) would need that sum.
- **Consequences:**
  - If someone re-types a balance on the same day as earlier entries, those
    entries stay "on or after" the new date; editing or deleting one then
    moves the balance by its amount. Accepted as an edge case.
  - F-27 (log spending by text) reuses `createTransaction`, so it follows the
    same rule.

### ADR-053: Statement CSVs in Neon object storage (refines ADR-025)

- **Status:** Proposed (2026-10-10), from Simon. **The team should confirm it.**
- **Context:** F-06 reads PDF statements (ADR-044). The team wants each
  import's rows kept as a file that Gemini can read later, and wants proof
  that the kept file says exactly what the statement says. ADR-025 deletes
  the uploaded file after extraction and says no storage bucket is needed.
- **Decision:**
  - **The PDF is still never kept** (ADR-025, ADR-044 step 6): it is read in
    memory, and only its SHA-256 is stored on `import_batch`.
  - **Every import keeps one canonical CSV** of its normalized rows:
    `posted_on,description,amount,running_balance`, RFC 4180 quoting, CRLF,
    amounts as plain decimals from `src/lib/money`. Rows only: no name,
    address or full account number.
  - **Where:** a private bucket `statements` in Neon object storage
    (declared in `neon.ts`), key
    `w/<workspaceId>/a/<accountId>/<importBatchId>.csv`. `import_batch`
    stores the key and the CSV's SHA-256. The app talks to it only through
    Neon's Files SDK adapter (`files-sdk/neon`), which uses the AWS S3
    client internally; the four `AWS_*` variable names are Neon's.
  - **Neon in every environment, no emulator:** each environment uses a
    Neon branch's own bucket (storage credentials are branch-scoped).
    Deployments use their branch's bucket. Local development, Vitest and
    Playwright use the schema-only branch `storage-tests`, whose
    credentials come from a gitignored `.env.storage-tests` locally and from
    repository secrets in CI. This is the one exception to "tests never
    touch Neon": the database in tests is still local Postgres, and nothing
    in tests ever uses production's bucket. Test keys sit under random
    workspace ids, so parallel runs don't collide.
  - **Checks that the CSV is accurate:** before it is stored, the CSV is
    read back and must equal the parsed rows exactly. At commit, the stored
    file is downloaded, its SHA-256 compared with the preview's, parsed and
    reconciled again; the committed rows are the stored file's rows. Any
    difference stops the commit.
  - **Access:** server-only. The browser never gets a storage key, URL or
    credential.
  - **Deletion:** discarding a preview deletes its CSV; deleting an account
    deletes every CSV under its prefix. Deleting a workspace (F-19, not
    built) must delete `w/<workspaceId>/`.
  - **Balance:** imported rows never move the stored balance (ADR-050). On
    commit, the statement's closing balance replaces a manual account's
    typed balance when the statement ends on or after the date it was
    typed, and becomes the new `balance_as_of`.
  - **Gemini** reads these CSVs only in a later feature, under ADR-019 and
    ADR-040: while the key is on the free tier, only synthetic or sandbox
    statements may be sent.
- **Alternatives considered:** keeping nothing and reading rows from the
  database (no extra service, but no file for Gemini and no stored copy to
  check); keeping the PDF too (more to protect: full account numbers and
  addresses).
- **Consequences:** Five storage environment variables; without them import
  is switched off rather than failing. Storage tests need network access
  and the `storage-tests` credentials; CI needs four repository secrets,
  and pull requests from forks don't get them. Objects the E2E tests leave
  in the test bucket accumulate until the bucket is cleared. Vercel caps a request body at 4.5 MB,
  below ADR-044's 10 MB, so larger PDFs fail there until uploads go another
  way. A failed storage delete leaves an orphaned file, logged by id.

### ADR-054: CSV import: Capital One exports in built-in formats (refines ADR-044)

- **Status:** Proposed (2026-10-10), from Simon. **The team should confirm it.**
- **Context:** ADR-044 has the user map a CSV's columns once per
  institution (`csv_mapping`, ARCH-03). For HackNC only Capital One is
  supported, as for PDFs, so a mapping screen would have one bank to map.
  Capital One offers two exports: 360 checking and savings, with a balance
  after every row, and credit card, with no balances.
- **Decision:**
  - **Built-in formats, no mapping screen yet.** The two Capital One
    exports are recognized by their header names, in any column order
    (`domain/templates/capital-one-csv.ts`). Any other CSV fails with
    "Only Capital One CSV exports can be read for now". The mapping screen
    and the `csv_mapping` table are deferred, not dropped.
  - **One upload field for PDF and CSV.** A file starting with `%PDF-` is
    read as a PDF; a `.csv` name or `text/csv` type is read as a CSV.
    A CSV is at most 2 MB (under Vercel's 4.5 MB request cap) and 10,000
    rows, UTF-8, with or without a byte order mark, with LF or CRLF line ends.
  - **360 export:** the sign comes from Transaction Type (Debit is money
    out). The row order is the one in which every balance equals the one
    before it plus the row: the file's order or its reverse, since the
    export lists newest first. If neither works, rows go by date and the
    running-balance check blocks. Opening balance = first row's balance
    minus its amount; closing balance = last row's balance. Reconciliation
    then runs as for a PDF.
  - **Card export:** Debit is negative and Credit positive (ADR-008); the
    Posted Date is the date. The file has no balances, so `import_batch`'s
    opening and closing balances are null (migration 0007),
    `reconciliation` is `not_applicable` (ADR-010: "if running balance
    column exists"), the balance checks are skipped, and committing never
    changes the account's balance.
  - **Identity:** the last 4 digits come from the Account Number or Card
    No. column; the rest of the number is dropped, never stored or logged.
    As with a PDF that covers several accounts, only the chosen account's
    rows are read.
  - Everything after parsing is the PDF pipeline: canonical CSV in the
    `statements` bucket (ADR-053), the ADR-010 checks, preview, commit.
    Transactions get `source = 'csv'`; `import_batch.kind` is `csv`.
- **Alternatives considered:** the mapping screen now (works for every
  bank, but more to build and test for one bank this weekend); refusing
  card exports (no migration, but the most common Capital One download
  would fail).
- **Consequences:** Supporting another bank's CSV means writing another
  format, or building the mapping screen. The column names come from
  Capital One's documented exports, not from a real file in the repo:
  check them against a real export (kept in a gitignored `private/`
  folder). A PDF and a CSV of the same period only dedupe where their
  descriptions match.

### ADR-055: Retirement and investing count as saving, not spending (refines ADR-020)

- **Status:** Proposed (2026-10-10), agreed by the team in conversation,
  written by Jacob.
- **Context:**
  - ADR-020 counts money sent outside the workspace as spending unless the
    user marks it. Money paid into an IRA or a brokerage account leaves the
    workspace, so someone who saves would look like a big spender.
  - A 401(k) is taken out of pay before it lands, so it never appears in
    bank data. We can only know about it if the user tells us.
  - AGENTS.md section 2 rules out investing features. Showing how much went
    in is not one, but the line needs writing down.
- **Decision:**
  - **Saving, not spending.** Money moved into a retirement account (an
    IRA) or an investment account (a brokerage) counts as saving, like a
    transfer to savings. It is left out of spending and budgets, and shown
    under the system categories "Retirement" and "Investing".
  - **How it is recognised.** Until categories exist (F-08), such a
    transaction is marked as a transfer with no pair. Afterwards,
    categorization rules (ADR-013) put it in "Retirement" or "Investing",
    and both are excluded from spending.
  - **The retirement question.** Every workspace has one open question,
    shown as an action-required item until it is answered: "Is money going
    into a retirement plan for you?"

| Answer | What we store | What we show |
|---|---|---|
| Through my employer (401(k), 403(b)) | Optional monthly amounts: what you put in, and what your employer adds | The amounts the user typed (ADR-035's rule for amounts the user gives) |
| Into my own account (an IRA) | The answer only | The "Retirement" transactions we find |
| Not right now | The answer only | Nothing more; we do not ask again |

  - **Action required, without alarms (ADR-042).** The item sits in a
    "Needs your answer" list on Insights and in Settings, in neutral words,
    with no red, no badges that count up and no reminders by text. "Not
    right now" is a complete answer.
  - **Where the line is.** Reeflect shows how much money went in. It never
    shows holdings, prices or returns, never trades, and never recommends a
    plan, a fund or an amount.
  - **Synthetic people** (docs/SYNTHETIC.md) carry a `retirement` answer and
    `investing` transfers in the spec. Generator version 2.
- **Alternatives considered:** Treating IRA and brokerage payments as
  spending (wrong for savers); guessing a 401(k) from the gap between gross
  and net pay (we never see gross pay).
- **Consequences:**
  - A table for the answer (workspace, plan, the two optional amounts, when
    answered) needs a migration (ARCH-03).
  - F-08's preset categories gain "Retirement" and "Investing", excluded
    from spending.
  - AGENTS.md section 2 and docs/SYNTHETIC.md rule 7 now say this.
  - Batches made by generator v1 replay only from a v1 checkout. A v1 spec
    reloaded with v2 gives the same rows.

### ADR-056: Insights: compare with sample people (refines ADR-049)

- **Status:** Proposed (2026-10-10), by Jacob; updated 2026-10-11 with the
  details settled while building it (HO-043). Not in ADR-043's P0 or P1:
  built as Later unless the team moves it up.
- **Context:** ADR-049 asks for this record before a cross-workspace page is
  built. Users want to see how their money compares with people like them.
  Real-user aggregates wait for legal review (ADR-028), so the comparison is
  with synthetic people only.
- **Decision:**
  - **Who you are compared with.** The synthetic workspaces of one batch:
    the newest in the database the app points at. The batch-testing branch
    and production can therefore show different figures. Every group
    figure is labelled "Sample".
  - **Each sample person's figures are computed once, by code, when a
    batch is loaded**, and stored in an `insight_sample` table (one row per
    person, period and measure) that references `synthetic_batch` and is
    deleted with it. They are never hardcoded. A backfill command fills it
    for batches loaded earlier.
  - **Your figures are computed on request**, from your workspace only, by
    the same function. The page reads your workspace and the stored sample
    figures, never another workspace's transactions.
  - **Periods:** the last 30, 90 and 365 days, shown per month (amount ×
    30.4375 ÷ days). For the group they end at the batch's `asOf`; for you,
    yesterday (UTC). When your data starts partway through a period, your
    figures average over the days it covers, and the page says so.
  - **Groups**, built on request from the stored figures (at most a few
    hundred rows):
    - **People like you:** the 10 sample people just above you and the 10
      just below you by take-home pay for the period. At either end of the
      range, the 20 nearest.
    - **Everyone:** the whole batch.
    - The page shows the group's size, its take-home range and its persona
      mix. A batch needs at least 50 people; generating more is the answer
      to small groups.
  - **Measures:** spending per category (in dollars and as a share of
    take-home), kept after spending, moved to savings, retirement and
    investing (ADR-055), bills as a share of take-home, subscription count
    and cost, lowest balance before payday, no-spend days.
    - Categories are compared by **preset key** (ADR-057), so a renamed
      category still matches, plus an Uncategorized bucket. A row's
      category is its effective one (manual choice, else rule), worked out
      by F-08's own `classifyStored`.
    - **Take-home** is money in that isn't a transfer and is categorized as
      Income or not at all. Money in under another category is a refund
      and reduces that category's spending.
    - **No-spend days** ignore bills and subscriptions. **Lowest balance**
      is the lowest end-of-day total of checking accounts in the period.
    - "Typical" is the group's median; the spread is its quartiles (linear,
      rounded to the cent, `quantile` in `src/lib/money`).
  - **Wording** stays neutral ("a bit higher than typical"), with no
    rankings framed as failure (ADR-042). No number comes from a model
    (ADR-019).
  - **Slight tints**, asked for by the team: a pale green where a figure
    reads as going well (more kept or saved, less spent) and a pale warm
    tone where it doesn't, stronger only outside the middle half. The words
    always say the same thing, so colour is never the only signal. No tint
    for Uncategorized, or where the typical person spends nothing in a
    category.
- **Alternatives considered:** Hardcoded group figures (the same on every
  branch, and they go stale); computing from transactions on each request
  (reads other workspaces' rows on every visit); fixed take-home bands
  (the team preferred neighbours above and below); a cash-flow window
  (cash flow is what is being compared, so the groups look alike by
  construction).
- **Consequences:**
  - A migration adds `insight_sample` (ARCH-03): migration 0008.
  - `pnpm batch load` and `promote` write the figures in the same database
    transaction, from the rows just written; `pnpm batch rollup` recomputes
    them from the database (the backfill).
  - Workspaces with no categorization rules (new Nessie-backed accounts)
    show mostly Uncategorized; the page says how much and links to
    Transactions to add rules.
  - Developers see a sample workspace by being added to it as a member
    (`pnpm batch attach`, still to be built), as `editor`. Their edits make
    that workspace drift from its recipe: its stored figures go stale until
    a backfill, and `promote` replays the recipe without the edits.

### ADR-057: More preset categories; sample people arrive categorized (refines ADR-015)

- **Status:** Proposed (2026-10-10), by Jacob. The first eight presets were
  a starting set.
- **Context:**
  - ADR-015 starts workspaces with 6–8 preset categories. F-08 (ADR-013)
    built eight: groceries, dining, transport, housing, utilities,
    shopping, entertainment, income.
  - Common spending had nowhere to go (health, insurance, travel), and
    ADR-055 needs "Retirement" and "Investing".
  - Insights (ADR-056) compares people by category, so sample people need
    the same categories as everyone else.
- **Decision:**
  - **Eighteen presets.** The first eight stay as they are, in the same
    order. Ten are added after them: health, insurance, loans,
    subscriptions, personal care, kids & childcare, gifts, travel,
    retirement, investing. All can be renamed. Existing workspaces gain the
    new ones on the next editor visit, through the same idempotent seed.
  - **Retirement and investing are saving**, never spending (ADR-055).
  - **Sample people are categorized at batch load** like a real user would
    be:
    - Each person gets the presets.
    - Each merchant that always means one preset gets an exact-match rule.
    - A merchant used for two things gets manual choices instead.
    - Each transaction is stored with its category.
  - **Generator categories map onto presets** (`PRESET_FOR` in
    `src/features/synthetic`). Categories with no preset (Other,
    Education, card interest) and transfer pairs stay Uncategorized.
  - **The generator's own categories stay finer** than the presets, so the
    generated rows don't change: no new generator version.
- **Alternatives considered:**
  - Renaming the generator's categories to the presets: a generator v3,
    and the detail would be lost.
  - Storing categories on sample rows without rules: F-08 works out
    automatic categories from rules on read, so those rows would show as
    Uncategorized.
  - Marking every sample row manual: the rules page would be empty, and a
    developer's new rule would never apply.
- **Consequences:**
  - The budgets page (F-09) gets one row per preset; eighteen is the new
    upper end of ADR-015's range.
  - Nessie-backed and other real accounts still start with no rules.
    Starter rules for the demo accounts are a separate decision.

---

## AI and the agent

### ADR-019: AI features

- **Status:** Accepted (2026-10-06)
- **Decision:**
  - **AI never produces a number shown to the user.** For questions, the
    model calls server tools that run deterministic queries. For narratives,
    the model writes text with placeholders such as `{dining_overspend}` that
    code fills in. A post-check (the digit scan) rejects any output
    containing digits not inserted by code. The only exceptions are in
    ADR-035.
  - Send the minimum data: merchant strings and computed aggregates. Never
    send account numbers, names or raw files.
  - Provider: **Google Gemini API** through the `@google/genai` SDK,
    server-side only, wrapped behind `src/lib/ai` so it can be swapped. Key in
    `GEMINI_API_KEY`.
  - **Tier rule:** on Gemini's free tier, Google may use prompts and responses
    to improve its products, including human review. The free tier may be
    used only with sandbox or synthetic data. Before any real user's data is
    sent to Gemini, the key must come from a billing-enabled project.
  - Website AI features (category suggestions, "Ask Reeflect") are P2 and
    reuse the agent brain.
- **Consequences:** AI features degrade gracefully: if the model is
  unavailable, everything except the AI panels works.

### ADR-031: iMessage agent built on Photon Spectrum

- **Status:** Accepted (2026-10-06)
- **Context:** Photon builds Spectrum, an open-source SDK and cloud platform
  that runs AI agents inside messaging apps. Its thesis is that people prefer
  agents inside the apps they already use.
- **Decision:**
  - Reeflect has an iMessage agent built with `spectrum-ts`. The web app
    remains the full view.
  - **Channels:** iMessage only for now. Spectrum's terminal provider is used
    for development and tests. WhatsApp and Telegram are planned expansion.
  - **Fallback if no iMessage line is available at HackNC:** run the same
    agent through Spectrum's Telegram provider (a free bot) and present it as
    "the same agent, on Telegram for today; iMessage is the target channel."
    Only the provider list changes.
  - **Name and voice:** the agent is called **Reeflect**. Friendly, short,
    plain sentences; emoji used sparingly.
  - **Topic limit:** the agent declines non-finance topics with a short,
    polite redirect to what it can help with.
  - The agent reasons with the Gemini API and function calling (ADR-019,
    ADR-035, ADR-040). Its tools call the same repository functions as the
    website, with the same authorization.
  - The agent never moves money, pays bills or cancels subscriptions
    (ADR-001). Replies such as "cancel" only record the user's intent.
  - Photon's coding-agent skill is installed at kickoff:
    `npx skills add photon-hq/skills`.
- **Consequences:** Adds the agent feature folder, the worker (ADR-032), new
  tables (ARCH-03) and agent tests (TESTING).

### ADR-032: Agent architecture: thin worker plus Next.js brain

- **Status:** Accepted (2026-10-06)
- **Context:** Spectrum's main pattern is a continuously running message
  loop. Its webhooks deliver inbound messages only; replying needs a
  long-lived SDK instance, which is unreliable on serverless functions.
- **Decision:**
  - **Worker** (`agent-worker/`, a pnpm workspace package): a small
    long-running Node or Bun process that holds the Spectrum connection. It
    receives messages, shows typing indicators, forwards each turn to
    Next.js, and sends replies, images and reactions. It contains no business
    logic and no database access.
  - **Brain** (Next.js, `src/features/agent/`): identity lookup, Gemini,
    tools, reply composition, images. Endpoint `POST /api/agent/turn`.
  - **Worker → Next.js:** HTTPS with a shared `AGENT_SERVICE_TOKEN` header; an
    unknown or missing token returns 404.
  - **Next.js → worker** (proactive messages): the worker exposes
    `POST /send` on a small HTTP server, protected by the same token.
  - **Hosting:** the worker runs on **Render** as a web service; Next.js runs
    on Vercel. ADR-041 covers keeping the worker awake.
- **Alternatives considered:** Spectrum webhooks into a Next.js route (fewer
  deployments, but unreliable replies on serverless).
- **Consequences:** The repository is a pnpm workspace. Root `lint`,
  `typecheck` and `test:unit` scripts must cover `agent-worker/` and
  `packages/` too.

### ADR-034: Phone linking, agent identity, judge demo flow

- **Status:** Accepted (2026-10-06)
- **Decision:**
  - A text only acts as a Reeflect user after that user links their phone:
    the website shows a one-time code ("Text `LINK 4821` to Reeflect"), valid
    for 10 minutes and usable once. The code is stored hashed.
  - The worker forwards the sender handle and Spectrum space id; Next.js
    stores them in `messaging_identity` against the user.
  - Unlinked handles receive only a short sign-up message. No financial data
    is ever sent to an unlinked handle.
  - In a direct chat the agent uses the user's **Personal** workspace.
    Household group chats are P2 and use only the household workspace.
  - Users can unlink from the website or by texting `STOP`.
  - **Judge demo flow ("Try it"), demo mode only:**

| Step | What happens |
|---|---|
| Before judging | `pnpm demo:judges` creates 5 judge workspaces, each with its own Nessie sandbox customer and history. No team member's data is involved. |
| On screen | A QR code that opens Messages to Reeflect's number with the text `TRY` pre-filled |
| Judge sends TRY | Only when `DEMO_MODE=true`: the brain links that phone handle to the next free judge workspace for 2 hours and replies with a welcome and that workspace's summary |
| Judge chats | Everything works as for a normal linked user, on sandbox data only |
| Limits | At most 5 judge links at once; each expires after 2 hours; when none are free, the reply says the demo is full |
| After judging | `pnpm demo:reset` unlinks all judge handles and deletes the judge workspaces |
| Outside demo mode | `TRY` is ignored; only the normal one-time-code linking works |

- **Consequences:** Adds the `messaging_identity` and `agent_link_code`
  tables, a `DEMO_MODE` flag, two demo scripts, and identity tests (TEST-04,
  TEST-06).

### ADR-051: Phone linking: six digits, approved on the website (refines ADR-034)

- **Status:** Proposed (2026-10-10), by Muhammad
- **Context:** ADR-034 links a phone when it texts a one-time code, and its
  example is four digits. A short code can be guessed: someone texting
  random codes could link their own phone to another person's account and
  then read that person's finances. The team is also on Photon's free plan,
  where users may reach the agent on different numbers.
- **Decision:** ADR-034 holds, with these additions.
  - **Six digits.** The code is six digits, shown as `LINK 482 193`. It is
    valid for 10 minutes and works once. Only a hash keyed with a server
    secret is stored, so the plain code exists only in the browser tab that
    asked for it; reloading the page hides it.
  - **Approval on the website.** Texting the code does not link the phone.
    It records a request, and the Settings card then shows "Link request
    from phone ending 1234" with **Approve** and **Not me**. The identity is
    created only on Approve. Until then the phone gets the same sign-up
    reply as any unlinked phone.
  - **Attempt limit.** A phone that sends 5 wrong codes within 10 minutes is
    locked out of linking for the rest of that window. A wrong, expired,
    used and already-claimed code all get the same reply.
  - **One link each way.** A phone links to one user and a user has one
    linked phone, both enforced by unique indexes.
  - **The number to text is a setting.** `AGENT_PHONE_NUMBER` is optional.
    When set, the card shows it with a link that opens Messages; when unset
    the card says "Text … to Reeflect" and shows no number.
  - **Opt-in** to proactive texts (ADR-038) is a checkbox on the linked
    card, off by default.
- **Alternatives considered:** four digits with the attempt limit alone
  (shorter to type, weaker); six digits without the approval step (one
  fewer step, but a guessed code would link straight away).
- **Consequences:**
  - `agent_link_code` also holds the pending request, and a new
    `agent_link_attempt` table counts wrong codes (ARCH-03).
  - The judge "Try it" flow in ADR-034 is unchanged and still to be built;
    it needs one number that every judge can text.
  - Linking takes one more step in the demo.

### ADR-035: Agent number rules (refines ADR-019)

- **Status:** Proposed
- **Decision:** ADR-019 holds, with two narrow, user-controlled exceptions:
  1. **Logging from text.** For "12 lunch", code extracts the amount from the
     user's own message; Gemini only proposes the category. If the amount is
     ambiguous, the agent asks rather than guesses.
  2. **Receipt photos (P1).** Gemini may read the total and merchant, but
     nothing is saved until the user confirms ("$23.40 at Trader Joe's in
     Groceries? Reply yes or 👍").

  All other numbers in replies come from tools and are inserted by code. The
  digit scan (ARCH-07) runs on every reply.
- **Consequences:** `logSpending` rejects any amount that does not appear in
  the user's message text.

### ADR-038: Proactive messages

- **Status:** Accepted (2026-10-06)
- **Decision:**
  - Proactive texts (subscription alerts, bill reminders, weekly recap) are
    sent only after the user opts in during phone linking. Each type can be
    turned off.
  - **Quiet hours:** default 9 PM to 9 AM in the workspace time zone; messages
    wait until quiet hours end. Users can change them in both places:

| Where | How |
|---|---|
| Website | Settings → Notifications: start and end time pickers |
| iMessage | A message such as "Reeflect, register new quiet hours 11PM to 7 AM". Parsed by code, not AI; accepts forms like "11pm to 7am", "11 PM - 7 AM", "23:00 to 07:00". Reeflect confirms: "Quiet hours set: 11:00 PM to 7:00 AM. Reply UNDO to go back." Unclear input gets an example instead of a guess. |

    Ranges may cross midnight. Start and end cannot be equal.
  - At most 3 proactive messages per user per day.
  - **Lock-screen privacy.** Reeflect cannot tell whether a phone is unlocked;
    iOS decides what the lock screen shows. So:
    1. The **text** of every proactive message contains no amounts: "Your car
       payment is coming up in 7 days. Open Messages to see the details."
    2. The **amounts** are in an image card attached to the same message,
       which the user sees once they open the conversation.
    3. **Test at kickoff** whether the iOS lock-screen notification shows a
       readable thumbnail of the image. If it does, replace step 2 with
       "Reply DETAILS to see the amounts."
    4. Phone linking shows a tip: in iOS Settings, set notification previews
       to "When Unlocked" for extra privacy.

    Replies to the user's own questions include amounts directly.
- **Consequences:** Adds notification preferences (website and iMessage
  command), a quiet-hours parser with tests, image cards for proactive
  messages, and a daily-cap check in the brain.

### ADR-040: Gemini used without tier-driven limits

- **Status:** Accepted (2026-10-06)
- **Context:** The team will enable Gemini's paid tier after the hackathon and
  does not want the free tier to shape the product.
- **Decision:**
  - Design and build every feature as if on the paid tier. Gemini may be used
    wherever it improves the experience: understanding any free-form message,
    choosing tools, categorizing, reading receipts, and writing replies and
    recaps. Use the model that does these best, set in `GEMINI_MODEL`.
  - Code still handles the following itself, for security and correctness
    rather than cost: link codes, TRY, STOP and UNDO (ADR-034); extracting
    amounts from the user's text (ADR-035); and parsing quiet-hours times
    (ADR-038). Gemini may recognize these intents, but code validates and
    executes them.
  - Every Gemini call has a fallback reply on error or timeout.
  - **During the hackathon** the key is on the free tier, so only sandbox and
    synthetic data are sent (ADR-019). Switching to a paid key afterwards
    needs no code change.
- **Consequences:** No free-tier workarounds in the design. Free-tier rate
  limits may still occur during judging; the error fallback covers them, and
  the team load-tests the demo path at hour 20 (HANDOFF.md).

### ADR-045: Gemini summary on the website (refines ADR-019)

- **Status:** Accepted (2026-10-10), decided by Muhammad
- **Context:** ADR-019 put website AI features at P2. The team wants Gemini
  to turn the numbers that code has computed, from statements and Nessie,
  into a plain summary of where the user stands.
- **Decision:**
  - The website has a panel where Gemini writes a summary and suggestions.
    It is P1 (ADR-043).
  - Code computes every figure (balance, what is due before payday, spending
    by category, subscriptions). Gemini receives those aggregates and writes
    sentences with placeholders; code fills them in and the digit scan runs
    (ADR-019, ARCH-07). Gemini never reads a statement file and never
    produces a number. Its input is data that code derived from the parsed
    rows (ADR-044) and from Nessie.
  - **Suggestions are allowed.** Gemini may suggest what the user could do
    with their own money, based on their own data: for example, which
    subscriptions cost the most over a year, or where spending rose. It does
    not recommend financial products, investing, or a company to switch to,
    and it uses no guilt (ADR-001, ADR-042).
  - The panel reuses the agent brain's tools and `src/lib/ai`. If Gemini
    fails, the panel shows a fixed template with the same figures.
- **Consequences:** ADR-019's line placing website AI features at P2 no longer
  applies to the summary panel; category suggestions and "Ask Reeflect" stay
  later. The tier rule in ADR-019 still holds: only sandbox or synthetic data
  reaches a free-tier Gemini key.

### ADR-041: Keeping the Render worker awake; worker as the job clock

- **Status:** Accepted (2026-10-06) for keep-awake; the job clock is Proposed
- **Context:** Render's free web services spin down after 15 minutes without
  inbound traffic and take about a minute to wake. The worker's Photon
  connection is outbound, so it does not count as traffic. Vercel's Hobby
  plan only allows cron jobs that run once per day.
- **Decision:**
  - **Keep-awake (Accepted):** the worker exposes `GET` and `HEAD /health`.
    It pings its own public URL every 10 minutes, and a free external uptime
    monitor (for example UptimeRobot or cron-job.org) pings it every 5 to 10
    minutes as a backup that also wakes it after a restart.
  - **Limits to respect:** Render's free instance hours are shared across the
    workspace (750 per month), enough for one always-on service only; keep no
    other free Render services running. If the worker still misses messages
    in testing, switch to Render's Starter instance (about $7 a month).
  - **Job clock (Proposed):** the worker calls `POST /api/jobs/tick` on
    Next.js every 5 minutes with the service token. The tick runs stale
    Nessie syncs, new subscription alerts, release of messages held by quiet
    hours, and bill-reminder checks. All tick work is idempotent.
  - One daily Vercel Cron job remains as a backup for bill reminders.
- **Consequences:** ARCH-12 and ARCH-13 use the tick instead of frequent
  Vercel Cron. A test confirms the worker answers a text after 30 minutes of
  idle time.

---

## Process

### ADR-021: Git workflow, branch protection, CI

- **Status:** Accepted (2026-10-06)
- **Decision:**
  - No commits to `main`. All work happens on branches and merges by pull
    request.
  - Agents check the branch first and, if on `main`, ask the user for a branch
    name or permission to create one (AGENTS.md section 3).
  - GitHub ruleset on `main`: require a pull request, 1 approval, dismiss
    stale approvals, last push approved, conversation resolution, required
    status checks (strict), linear history, no force push, no deletion, squash
    merges. Defined in `.github/rulesets/main.json`.
  - CI (`.github/workflows/ci.yml`): lint + format + typecheck, unit tests,
    E2E tests, build, dependency audit. CodeQL runs in its own workflow.
  - A local git hook (lefthook) refuses commits on `main` as a second line of
    defence.
- **Consequences:** Required check names in the ruleset must match CI job
  names exactly. Change both together.

### ADR-022: Agent instructions

- **Status:** Accepted (2026-10-06)
- **Decision:** `AGENTS.md` at the repository root is the single source of
  instructions. `CLAUDE.md` contains only `@AGENTS.md`. `GEMINI.md` contains
  only `@./AGENTS.md`. GitHub Copilot and Codex read `AGENTS.md` directly.
  CodeRabbit detects `AGENTS.md` automatically and gets extra path rules from
  `.coderabbit.yaml`.
- **Consequences:** Never put rules only in `CLAUDE.md` or `GEMINI.md`.

### ADR-023: Testing policy

- **Status:** Accepted (2026-10-06)
- **Decision:** Vitest and Playwright carry equal weight: no feature is done
  without both. This means equal importance, not equal test counts. Details,
  coverage thresholds and required security tests are in `TESTING.md`.
- **Consequences:** CI blocks merges on any failing or skipped required test.

### ADR-027: Frontend previews for features not built in time

- **Status:** Accepted (2026-10-06)
- **Context:** Not every feature will be finished in 24 hours. The team builds
  real features in priority order and shows the rest as frontend-only
  previews.
- **Decision:**
  - A preview lives in `src/features/<feature>/preview/` and uses only static
    fixtures from `preview/data.ts`. It never calls the database, Plaid, the
    AI provider, or any real server action.
  - Previews are switched on by the `NEXT_PUBLIC_ENABLE_PREVIEWS` flag. With
    the flag off, preview routes and entry points do not render.
  - Every preview screen shows a small "Preview" badge, and preview data is
    visibly sample data (for example, "Sample Coffee Co.").
  - Real features never import from any `preview/` folder.
  - When a feature is built for real, its preview folder is deleted in the
    same PR.
  - Each preview gets one Playwright smoke test (renders, no console errors,
    badge visible). Previews are excluded from coverage thresholds and from
    the workspace isolation matrix because they touch no data.
- **Consequences:** The demo can show the full product vision while the
  codebase stays honest about what works. PITCH.md describes previews as
  previews.

### ADR-029: No project work before the hacking window

- **Status:** Accepted (2026-10-06)
- **Context:** Hackathon rules (MLH default rules unless HackNC states
  otherwise) require project work to happen during the event. Ideas and
  planning beforehand are allowed.
- **Decision:**
  - Before the hacking window: only ideation, these planning documents,
    creating third-party accounts and keys, and testing generic tooling in a
    throwaway repository.
  - At kickoff: create the real repository, commit the docs and
    configuration, scaffold the app, and start building. No mockup code from
    the throwaway repository is copied in.
  - Disclose in the Devpost submission that planning documents and CI
    configuration templates were prepared before the event. If HackNC's rules
    or organizers say otherwise, follow them.
- **Consequences:** The scaffold, ruleset import and first green CI run happen
  in the first hour of hacking (HANDOFF.md kickoff runbook).

---

### ADR-058: Recurring payments from observed patterns, with user confirmation

- **Status:** Accepted (2026-10-11), explicitly requested by Muhammad in the
  implementation approval. Supersedes ADR-014's fixed timing/amount detector.
- **Context:** Electricity bills can change substantially each month, rent
  is a recurring obligation, and recurring payments need not be weekly or
  monthly. The user asked to find patterns instead of applying fixed
  subscription constructs.
- **Decision:**
  - Present **Recurring payments**, with bill/subscription kind and
    fixed/variable amount mode as independent, user-correctable properties.
  - Group posted outflows by account and conservatively normalized payee.
    Inspect up to three years of history. Infer an interval or calendar-month
    cadence from observed dates and measure dispersion relative to that
    cadence. The documented minimum evidence and dispersion limits are
    confidence guardrails, not preset 6–8/25–35 day or ±15% amount windows.
  - Require at least three supporting charges for a suggestion. Irregular or
    ambiguous histories remain undetected. All suggestions require user
    confirmation before contributing to estimated recurring costs.
  - Amount variation does not reject a date pattern. Describe the observed
    amounts as fixed or variable, show actual supporting charges and a typical
    amount/range, and let the user correct both classification and estimate.
    Only an established user-confirmed fixed amount gets a price-change flag;
    normal variable-bill fluctuations are not labelled price increases.
  - Manual entries can start tracking before enough history exists, including
    a user-entered schedule/date and amount estimate. Dismissals, corrections
    and subscription keep/planning-to-cancel decisions survive refresh/import.
  - Actual posted spending and estimated future costs are separate. Future
    dates say "Expected" unless explicitly entered by the user. Estimates do
    not create transactions or change account balances. Cancellation plans do
    not remove current costs; cancellation controls apply to subscriptions.
  - Reuse ADR-030's bill classification and due-date precedence; predicted
    obligations are never treated as proof that a bill has been paid. Exclude
    identified transfers, pending rows, refunds, zero amounts and future rows
    from recurring-charge evidence (ADR-020). Scheduled reminder delivery and
    proactive iMessage alerts remain F-22/F-26.
- **Consequences:** F-10's complete website scope now includes recurring bill
  tracking. Explain evidence and confidence on screen; document algorithm
  guardrails and limitations in the feature README. Test variable utilities,
  quarterly/fortnightly patterns, false positives, preserved user choices,
  account isolation and actual-versus-estimated totals. Use a new additive
  recurring-series migration and a public post-import refresh API.

### ADR-060: Sample years in the developers' own accounts (exception to ADR-049)

- **Status:** Accepted (2026-10-11)
- **Context:** To test Insights against the sample people, the three
  developers need a year of history in the accounts they sign in with.
  ADR-049 keeps synthetic data out of real users' accounts.
- **Decision:** For the hackathon, `pnpm batch give` may write one spec
  person's year into a named developer's Personal workspace: sample
  accounts (`source = 'synthetic'`, nickname starting "Sample · ") and
  their transactions, plus any missing preset categories and rules. It adds
  no `synthetic_workspace` marker, so those workspaces stay out of the
  comparison group (ADR-056). `pnpm batch take-back` removes the sample
  accounts and their transactions. The only other exception is the Nessie
  demo customer that judges and developers use (ADR-048). Nobody else's
  account gets synthetic data.
- **Consequences:** The developers' own figures in Insights include sample
  rows, labelled by their accounts. Take the data back before using these
  accounts for anything real. Categories and rules that were added stay.

### ADR-061: Ask the user to categorize large uncategorized payments (refines ADR-055, ADR-057)

- **Status:** Proposed
- **Context:** Some large payments match no rule and no preset: a car
  down payment, a car bought outright, tuition installments, a one-off
  repair. They are left in "Uncategorized", which is right (code can't
  know what they were), but one of them can be most of a month's
  spending, and Insights then says less than it could.
- **Decision:** A large uncategorized payment becomes an open question in
  the "Needs your answer" list that ADR-055 introduced for the retirement
  question, on Insights and in Settings: "What was this payment for?"
  - **Which payments.** Money out, uncategorized, not a transfer or a card
    payment (ADR-020), posted in the last 90 days, and either $250 or more
    or at least half of the workspace's typical monthly income. Code
    picks them; a model never does.
  - **Answers.** Any category in the workspace (choosing one is a manual
    categorization, with the option to apply it to the merchant as a rule,
    ADR-013), or "Leave it uncategorized". Both are complete answers, and
    the question does not come back for that transaction.
  - **Tone (ADR-042).** Neutral words, optional, no red, no badge that
    counts up, no reminders by text.
- **Consequences:**
  - Needs a place to remember "left uncategorized" per transaction (a
    column or a small table, so a migration, ARCH-03).
  - The "Needs your answer" list has to exist; it was designed in ADR-055
    but is not built yet.
  - Education (tuition) has no preset, so tuition would always show up
    here. Adding an "Education" preset is a separate decision.
  - Tests: which payments qualify (threshold, transfers excluded, the 90
    days), each answer, and that an answered question stays answered.

---

## Template

```markdown
### ADR-0XX: Title

- **Status:** Proposed | Accepted (YYYY-MM-DD) | Superseded by ADR-0YY
- **Context:** Why a decision is needed.
- **Decision:** What we will do, precisely.
- **Alternatives considered:** Optional.
- **Consequences:** What follows, including costs and follow-up work.
```
