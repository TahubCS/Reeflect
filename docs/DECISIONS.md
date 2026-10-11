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
- New ADRs take the lowest unused number in your own block (AGENTS.md
  section 9, "Reserved numbers"); list them in the Index in number order.
  Use the template at the bottom.
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
| ADR-059 | Agent replies: one request with labels, and a chain of models (refines ADR-019, ADR-040) | Proposed |
| ADR-060 | Monthly budget interactions and recorded actual spending (refines ADR-015) | Accepted |
| ADR-061 | Paydays found in deposits, confirmed like recurring payments (refines ADR-058) | Proposed |
| ADR-062 | A text that confirms what the user just did is not a proactive message (refines ADR-038) | Proposed |
| ADR-064 | Logging spending by text: code decides, asks when unsure, never guesses (refines ADR-035, ADR-040) | Proposed |
| ADR-065 | The agent remembers one open question: which account a text's spending is for (refines ADR-064) | Proposed |
| ADR-067 | Receipt photos: the model reads, code checks, the person confirms (refines ADR-035, ADR-065) | Proposed |
| ADR-082 | Sample years in the developers' own accounts (exception to ADR-049) | Accepted |
| ADR-083 | Ask the user to categorize large uncategorized payments (refines ADR-055, ADR-057) | Proposed |
| ADR-084 | Reserved ADR and handoff numbers for each developer | Accepted |
| ADR-102 | Planned transactions are kept apart from the ledger (refines ADR-042, ADR-050) | Proposed |
| ADR-103 | Built-in category keywords when no saved rule matches (refines ADR-013) | Proposed |
| ADR-104 | Quiet hours per user, in Eastern time; UNDO takes back the latest text change (refines ADR-038, ADR-064) | Proposed |
| ADR-105 | Subscription alerts and bill reminders by text: DETAILS for amounts, a reply confirms (refines ADR-030, ADR-038, ADR-041, ADR-058, ADR-063) | Proposed |

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

### ADR-059: Agent replies: one request with labels, and a chain of models (refines ADR-019, ADR-040)

- **Status:** Proposed (2026-10-11), by Muhammad
- **Context:** F-25 makes the agent answer "how am I doing?". ADR-019 says a
  model may never produce a number, and ADR-040 says every model call needs
  a fallback. The key's daily allowance is small for the strongest models
  (20 requests a day each) and large for the lite ones (500).
- **Decision:**
  - **One request per text, with labels.** Code works out the figures first
    (the Insights measures for the last 30 days, ADR-056, and the account
    balances). The model is given only label names such as `{cash_total}`
    and plain-word notes, never an amount, count, date or account name. It
    writes the sentences; code fills the labels in.
  - **The days until payday come from the calendar (added 2026-10-11).**
    When a payday is confirmed (ADR-061), the agent also has the
    figures in the calendar's headline (ADR-042): what is due before
    that payday, what is left after it, and the per-day amount. They
    are worked out by the calendar's own `summarize` on the same data
    the dashboard loads (`loadCashflowData`), so a reply and the
    website cannot disagree. These are exact, not monthly averages.
    For "how am I doing?" the reply leads with them. With no payday
    confirmed, the reply says where to confirm one, as the website
    does.
  - **Categories, budgets, payments and accounts (F-28, added
    2026-10-11).** Still one request per text: code looks everything up
    first and the model picks from the labels. Three more groups:
    - *This month so far*, from the Budgets page's own `readBudgetMonth`:
      for up to twelve categories with spending or a budget, largest
      spending first, its name, what was spent, its budget, and what is
      left or how far over; and `{month_spent}`, the month's total. Only
      this month is answered; for any other period the reply says so. If
      that read fails, these labels are left out and the rest still
      answers.
    - *The next three payments before payday*, from the same `summarize`:
      each one's name, amount and written-out date, soonest first.
    - *Each account, up to six*: its nickname and its balance; for a card
      or a loan, what is owed.

    The descriptions of the category and account labels are written per
    workspace. A category's description names the category, so the model
    can match "food" or a misspelling to it; this is the one place a
    name the person chose reaches the model, and a name holding a digit
    or a brace is not sent. An account's description says only what kind
    of account it is; its nickname and a payment's name are only ever a
    label's value, filled in by code.
  - **The code-built reply picks its sentences from the question (F-28,
    added 2026-10-11).** When no model answers, code reads the text's
    words: a category's name (one typo forgiven, and "food" for Dining
    and Groceries) gives that category's spending and budget; "bill",
    "due", "upcoming", "owe" or "coming up" gives the next payments; an
    account's kind or nickname gives its balance; anything else gives
    the general summary as before. A wrong reading costs a plain answer
    to the wrong question, never a wrong figure.
  - **Two checks on every draft, the same for every model:** no digit
    outside a label, and only labels that have a value. A draft that fails,
    or is too long for a text, is dropped and the reply is built by code
    from the same figures. A draft that uses a monthly average must say
    "a month", and one that uses a figure for this month so far must say
    "this month" (added 2026-10-11), so neither can pass for the other.
  - **A chain of at most six models,** tried in order. The deployed app
    uses the users' chain: `gemini-3.8-flash`, `gemini-3.7-flash`,
    `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`.
    Everything else (local development, `pnpm ai:check`) uses a test
    chain that shares no model with it, `gemini-3.1-flash-lite`, because
    each model has its own daily allowance and trying things out must
    not use up what users' texts need. `GEMINI_MODELS` overrides either
    chain. A model that fails is skipped and left alone for
    five minutes (an hour for a name the API does not know). About 4
    seconds per attempt and 14 in total; after that the code-built reply is
    sent. A reply the model did not finish counts as a failure.
  - **Nothing is kept at Google** (`store: false`) and the agent has no
    conversation memory: each text is answered on its own.
  - **Tool calling is not used.** Code does every lookup up front, which
    halves the requests per text. F-28 was expected to bring it in and
    was built without it (decided by Muhammad, 2026-10-11): its lookups
    are few and cheap enough to do for every text.
  - **The current key is used for real users' texts for now.** ADR-019's
    rule that only a billing-enabled key may see real users' data is set
    aside until billing is sorted out. What reaches the model is the
    person's own message and label names.
  - `pnpm ai:check` asks each test model (`pnpm ai:check users`: each of
    the users' models) one test question with the
    real key and reports which answer.
- **Alternatives considered:** Gemini's tool-calling loop (two requests per
  text for one lookup); one model with no chain (20 answers a day); giving
  the model the figures (breaks ADR-019).
- **Consequences:**
  - The agent's figures match the Insights page, since both use
    `workspaceMeasures`, and the calendar's headline, since both use
    `summarize`.
  - Follow-up questions ("and last month?") do not work yet.
  - **The activity figures are monthly averages, not totals:** the last 30
    days scaled to an average month, so a reply can be a few dollars away
    from the exact 30-day total. The model is told to say "about … a month",
    and a draft that uses one of these figures without the word "month" is
    dropped for the code-built reply (decided by Muhammad, 2026-10-11).
  - Once the stronger models' daily allowance is spent, replies come from
    the lite models; the same checks apply.

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

---

### ADR-061: Paydays found in deposits, confirmed like recurring payments (refines ADR-058)

- **Status:** Proposed (2026-10-11), from Simon. **Muhammad (F-10 owner)
  should confirm it.**
- **Context:** The calendar's headline needs the next payday (ADR-042, which
  says recurring income must be detected). ADR-058 finds recurring payments
  in money going out only. The team chose code, not Gemini, to find paydays.
- **Decision:**
  - **Same rules, other direction.** ADR-058's timing rules (three or more
    dated rows, a learned interval or calendar-month cadence, the same
    dispersion limits, inactive after two missed intervals) also read posted
    deposits into **checking and savings**. They become recurring payments
    of kind `income`, shown as "Payday". Card credits and transfers are not
    read.
  - **One account and payee, one payment.** A payee that has charges on an
    account is not also read as pay there, so a shop's refunds never become
    a payday.
  - **Confirmation as before.** A detected payday is a suggestion until the
    person confirms it on Recurring payments; they can also add one by hand
    or correct its schedule and amount. Only confirmed, active paydays reach
    the calendar.
  - **Pay is not a cost.** Paydays stay out of the recurring cost totals and
    the payment count; the page shows them as "Expected pay" a month.
    Keep / planning to cancel applies to subscriptions only.
  - **The calendar** (F-12) reads confirmed recurring payments: pay, bills
    and subscriptions fall on their expected dates after today, using F-10's
    estimated amounts, so the calendar and the Recurring payments page
    agree. A card's payments do not move the balance line (ADR-024). The
    headline's next payday is the next confirmed payday.
- **Consequences:**
  - Migration `0011_recurring_income` widens `recurring_series.kind`.
  - A payday needs three deposits before it is suggested; until then the
    person can add it by hand.
  - Someone paid irregularly gets no suggestion and the headline shows the
    balance only, as ADR-042 already allows.

### ADR-082: Sample years in the developers' own accounts (exception to ADR-049)

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

### ADR-083: Ask the user to categorize large uncategorized payments (refines ADR-055, ADR-057)

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

### ADR-062: A text that confirms what the user just did is not a proactive message (refines ADR-038)

- **Status:** Proposed (2026-10-11)
- **Owner to confirm:** Muhammad Tahub Khatri
- **Context:** A phone that texts `LINK` is told to press Approve on the
  website. When the user pressed it, the website said "Connected" and the
  phone heard nothing, so the person could not tell whether it had worked.
  The worker could only reply to a text, and approval happens on the
  website. ADR-038 covers texts Reeflect sends first, but it was written for
  alerts and reminders: opt-in, quiet hours and three a day.
- **Decision:**
  - When the user does something on the website that changes what their
    phone can do, the phone is told once, straight away. The first case is
    approving a link: "You're linked to Reeflect. Text me "how am I doing?"
    any time. Text STOP to unlink."
  - Such a text is **not** a proactive message under ADR-038: no opt-in is
    needed, and quiet hours and the daily cap do not apply. The user asked
    for it by acting, seconds earlier, with the phone in their hand.
  - It goes only to the conversation the action is about, and holds no
    amounts and no financial data.
  - It is sent through the worker's `POST /send` (ADR-032), built here.
    The app waits up to 5 seconds. If it cannot be sent, what the user did
    still holds, and the website says what to do instead ("Text Reeflect
    anything to start").
  - **Disconnect and "Not me" (added 2026-10-11).** The same rule
    covers the other two things the website can do to a phone.
    Disconnect texts the phone that it was disconnected and will not
    be answered any more. "Not me" texts the phone that was waiting
    on a code that the request was declined. Each is one last text
    to a phone that is no longer, or never was, linked: it holds no
    financial data, so ADR-034 is kept. STOP from the phone is
    already answered in the conversation, so the app sends nothing
    more for it.
  - Alerts, reminders and recaps stay under ADR-038.
- **Alternatives considered:** saying nothing (the problem); telling the
  phone on its next text (the person has no reason to send one); treating
  it as proactive (a user who did not opt in to alerts would never learn
  the link worked).
- **Consequences:** The app needs `AGENT_WORKER_URL`. The worker's `/send`
  exists before F-26, which will reuse it.

### ADR-064: Logging spending by text: code decides, asks when unsure, never guesses (refines ADR-035, ADR-040)

- **Status:** Proposed (2026-10-11)
- **Owner to confirm:** Muhammad Tahub Khatri
- **Context:** F-27 is the first time a text writes to someone's data.
  People send short forms, typos and half-sentences. ADR-035 says code
  takes the amount from the text and asks when it is ambiguous; ADR-040
  says code executes UNDO. The agent keeps no conversation memory, so it
  cannot ask a yes/no question and act on the answer.
- **Decision:**
  - **Code reads the text** (`parseLog`, pure). A text is spending when it
    has exactly one clear amount and a sign of spending: the short form
    (an amount first or last with a few words, "12 lunch"), a spending
    word with one typo forgiven ("spnt 12 on luch"), or a request ("log 12
    lunch"). Questions, statements about habits, and numbers that are not
    money (times, dates, counts, "7up") are never spending.
  - **Sure: save at once and offer UNDO.** The reply says exactly what was
    saved. **Unsure: save nothing and say what is missing,** with an
    example to send. Cases: no amount, an amount in words, nothing to call
    it, more than one amount, more than two decimals, "2k", over
    $9,999.99, another currency (ADR-008), money coming in, a day other
    than today or yesterday.
  - **Not about logging at all:** the text goes to the normal answer
    (ADR-059), unchanged.
  - **Account.** One account that can hold spending: it is used. Several:
    the text must name one by nickname or kind ("from Everyday", "on
    card"), or the agent asks, naming their accounts (decided by Muhammad,
    2026-10-11). Never a loan.
  - **What is saved.** A normal transaction with `source: "text"`, through
    the transactions feature. It moves an account's balance by ADR-050's
    rule, the same as a row typed on the website. No database change.
  - **Category.** The saved rules and built-in keywords first (ADR-013,
    ADR-103). Only when they find none, one model request with the
    person's words and the workspace's spending category names; the answer
    must be exactly one of those names, checked by code, and is stored as
    a manual choice. The transaction is saved before the model is asked;
    the amount, the account and all figures stay out of the request.
  - **Budget line.** When the category has a budget this month and money
    is left, the reply adds the amount left, from the Budgets code. Over
    budget is not announced (ADR-042).
  - **UNDO** removes the most recent transaction this workspace logged by
    text in the last 24 hours, and restores the balance. It never removes
    a row typed on the website or imported.
  - **Limits.** $9,999.99 a text; 50 texts logged in 24 hours. The same
    message delivered twice is saved once (the transaction's id is worked
    out from the link and the message id).
  - **Every reply about logging is written by code.** Amounts in them are
    the person's own, formatted by code (ADR-035's exception).
- **Alternatives considered:** a model reading intent and amounts (breaks
  ADR-035, and a wrong read writes data); a yes/no confirmation step (needs
  conversation memory); a default account chosen on the website (a
  database change; the user chose asking).
- **Consequences:**
  - Reading intent is a judgement call. The rules are cautious: a doubtful
    text is never saved. A casual message that happens to fit the short
    form ("level 3") would be logged; the reply shows it and UNDO removes
    it.
  - On accounts fed by statements or Nessie the stored balance does not
    move (ADR-050), so the calendar shows the spending while "how am I
    doing?" keeps the statement's balance.
  - A model-picked category does not follow later rule changes.
  - Not built: logging money coming in, days before yesterday, receipts.

### ADR-065: The agent remembers one open question: which account a text's spending is for (refines ADR-064)

- **Status:** Proposed (2026-10-11)
- **Owner to confirm:** Muhammad Tahub Khatri
- **Context:** ADR-064 kept no conversation memory. With several accounts
  the agent asked "which account?" and told the person to send the whole
  text again. On a real phone that failed three ways: the natural answer
  ("it was from my checking account") had no amount and got the "how am I
  doing?" reply; the example the agent gave was longer than the short form
  allows, so sending it back was not read as spending; and "from muhammad
  checking" was not matched, because a nickname counted only as the last
  word. Nothing was logged in four texts.
- **Decision:**
  - **One question is remembered per linked phone, for 10 minutes:** the
    amount, the words, the day, and the accounts that were listed, in
    `agent_pending_log` (migration 0015). A newer question replaces it.
    This is the only conversation memory; ADR-064's "no database change"
    no longer holds.
  - **The reply numbers the accounts** and says what is waiting. The next
    text answers with a number, an account's name, or a kind of account
    they have exactly one of (decided by Muhammad, 2026-10-11). Filler
    around it is allowed: "it was from my checking account".
  - **Code reads the answer** (`readAccountAnswer`, pure), strictly: the
    whole text must be the answer. A question, new spending, or a number
    written as money is never taken for one, and goes on as any other text.
  - **An answer that fits no single account** (two checking accounts, a
    number not on the list) is asked again and nothing is saved.
  - **New spending or UNDO closes the question.** Other texts leave it open
    until it expires.
  - **The spending is saved on the day it was first texted,** through the
    same code as any other log: the same limits, category and UNDO.
  - **Account names are matched more loosely in the first text too:** a
    kind of account or "account" may follow the nickname ("from Everyday
    checking"), and punctuation in a nickname need not be typed.
  - The workspace still comes only from the verified link (ADR-034); the
    question is read and closed by link and workspace together.
- **Alternatives considered:** keeping no memory and only fixing the
  example (a short answer would still fail); a model reading the answer
  (breaks ADR-064: a wrong read writes data); keeping the conversation's
  history (more stored text than one question needs).
- **Consequences:**
  - A phone's last unanswered spending text is stored for up to 10 minutes
    after it is asked about; older rows are ignored, and replaced by the
    next question, but not swept.
  - An answer delivered twice is saved once; the second copy is then read
    as an ordinary text, so its reply can look out of place.
  - A nickname that contains a number ("360 Checking") cannot be named in
    the first text, because the number reads as a second amount; its place
    in the list works.

### ADR-067: Receipt photos: the model reads, code checks, the person confirms (refines ADR-035, ADR-065)

- **Status:** Proposed (2026-10-11)
- **Owner to confirm:** Muhammad Tahub Khatri
- **Context:** ADR-035 lets Gemini read a receipt's total and merchant, as
  long as nothing is saved before the person confirms. A photo of a receipt
  is real data, and ADR-040 keeps real data away from the free-tier key.
  The worker dropped photos without a word, and a text sent as a threaded
  reply too. ADR-065 remembers one open question per phone.
- **Decision:**
  - **Off by default.** `AGENT_RECEIPT_PHOTOS=on` turns it on (decided by
    Muhammad, 2026-10-11). Off, a photo gets a reply written by code that
    asks for the amount by text, and no model is called. Tests and the
    demo use generated receipts only (`tests/fixtures/receipts/`).
  - **The worker relays one photo** as base64 inside the turn request, at
    most 3,000,000 bytes, as JPEG, PNG, HEIC, HEIF or WebP. When it cannot
    (too large, another kind of file, several photos, a failed download)
    it says which, and the app writes the reply. It also forwards what a
    threaded reply holds. The image is never stored or logged: not by the
    worker, the app, or Google (`store: false`).
  - **A caption is not read,** except for LINK and STOP.
  - **A phone that is not linked** gets the sign-up reply; its photo is not
    looked at (ADR-034).
  - **One model request** with the image and the workspace's spending
    category names. The answer is five fields (kind, merchant, total,
    currency, category) in a shape the API enforces and zod checks again.
    Nothing else about the person is sent: no id, account or balance.
  - **Code checks every field.** The total goes through
    `parseReceiptTotal` in `src/lib/money`: one amount in US dollars with
    its two decimals, above zero, at most $9,999.99. A refund, another
    currency, a screenshot of a balance, and anything that is not exactly
    the shape asked for give no proposal. The merchant is cut to 40
    characters of letters and a few marks, and a word with a digit is
    dropped, so a model never puts a number of its own in front of the
    person. The category must be one of the workspace's names; the
    person's saved rules win over the model's choice.
  - **The proposal waits in `agent_pending_log`** (migration 0017 adds
    `kind`, `category_id` and `message_id`) for 10 minutes. It is the
    phone's one open question: a newer question replaces it, and a photo
    replaces an open "which account?".
  - **Confirming.** One account: "yes" saves it. Several: the question
    lists them, and the account's number or name saves it; a bare "yes"
    is asked again. "no" drops it. Code reads the answer, and the whole
    text must be the answer. A typed 👍 counts as yes; a tapback does
    not (see the consequences). New spending or UNDO closes the question;
    other texts leave it open.
  - **"yes" or "no" with nothing waiting** gets a reply that says so,
    instead of the summary.
  - **Saved as any text log** (`source: "text"`), dated the day the photo
    was sent: the same 50-a-day limit, UNDO and calendar label. The
    transactions feature is unchanged.
  - **One photo is at most one transaction:** the id comes from the link
    and the photo's message id. The same photo delivered again while its
    question is open is not read a second time.
  - **Every reply is written by code.** Printed instructions on a receipt
    can change nothing: the model has no tools, is given nothing to leak,
    and each thing it writes is only a field that code checks.
  - **Each model gets 8 seconds for a photo** inside the same 14 in total
    (ADR-059 gives 4 to a text). `pnpm ai:check receipt` sends each test
    model a generated receipt and reports whether it read the total.
- **Alternatives considered:** a second table for proposals (two open
  questions at once, and "1" or "yes" could answer either); a separate
  upload request or a multipart body (a little more room, more moving
  parts); a new `source` value (changes the transactions feature);
  reading the date from the receipt (another number from a model);
  accepting a tapback as yes (the app would have to know which message
  the tapback was put on).
- **Consequences:**
  - **Before the switch is turned on for real users,** two things are
    needed: a billing-enabled Gemini key (ADR-040), and a daily limit on
    photo reads for each phone. Today only confirmed logs are counted, so
    a linked phone could use up the models' daily allowance with photos
    it never confirms.
  - The photo is sent to Gemini as it arrived, so any EXIF data in it
    (which can include where it was taken) goes too. Removing it needs an
    image library, which was not added.
  - With the switch off the photo still travels from the worker to the
    app, where it is dropped; nothing goes to Google.
  - A photo over 3 MB is refused, which will include some full-size JPEG
    photos. A multipart body would raise that to about 4.3 MB.
  - A tapback 👍 does not confirm, so the question says "Reply yes".
    Spectrum does deliver tapbacks; they are not forwarded yet.
  - A merchant whose name is a number ("7-Eleven") is shown as "that
    receipt" and saved as "Receipt".
  - A receipt from another day is saved as today.
  - Photo reads share the models' daily allowance with replies.
  - A photo delivered again after its log was undone can be logged again
    by a new "yes", as with texts (ADR-064).
  - Deploy the app before the worker: an older app drops the photo and
    answers the empty text with the summary.

### ADR-084: Reserved ADR and handoff numbers for each developer

- **Status:** Accepted (2026-10-11)
- **Context:** All three developers took "the next number" for ADRs and
  handoff entries. With several branches open at once, two branches took
  the same numbers, and every merge of main meant renumbering and resolving
  conflicts in DECISIONS.md and HANDOFF.md.
- **Decision:** Each developer gets their own block of 20 ADR numbers and
  20 HO numbers, listed in AGENTS.md section 9 ("Reserved numbers"), and
  numbers new entries from it. Numbers up to ADR-061 and HO-054 stay as
  they are. Gaps inside a block are allowed. A full block gets the next 20
  numbers after the highest block, added to the table in their own commit.
  ARCH and TEST numbers stay shared. `pnpm docs:check` reads the table:
  it allows the unused numbers in a block and fails on an ADR or HO number
  above the shared range that is in no block.
- **Alternatives considered:** Renumbering at merge time, which is what
  kept happening. Dates or initials in the ids (HO-JH-3), which would break
  the existing citations and the docs check's number rules.
- **Consequences:** HO numbers are no longer in date order; the newest
  entry is the one at the bottom. The Index stays in number order, so two
  branches can still both add index rows next to each other, but the
  conflict is two additions and no renumbering.

### ADR-102: Planned transactions are kept apart from the ledger (refines ADR-042, ADR-050)

- **Status:** Proposed (2026-10-11)
- **Context:** People want to plan money they expect on a later day ("concert
  tickets on the 20th", "selling the bike, +$300 next week") and see what it
  does to the month. ADR-050 keeps manual transactions to today or earlier,
  and money still to come was left to F-22's bills. A transaction dated
  later would move a manual account's stored balance at once (ADR-050's
  rule), and budgets, Insights, recurring detection and the agent would all
  count it as real.
- **Decision:**
  - **Separate table.** Plans live in `planned_transaction` (account, day,
    signed amount, description, optional category), owned by the `plans`
    feature (F-37). Only the calendar reads them. They never move a stored
    balance and are not transactions anywhere else.
  - **Dates.** A plan is dated after today, in `DEFAULT_TIME_ZONE`, and no
    later than the calendar's last day (`dashboardWindow`), so it never
    lands where nobody can see it. Checking, savings and card accounts only;
    loans are left out, as their transactions are.
  - **On the calendar.** A future plan is an expected item: it moves the
    dotted balance line and, before payday, counts in "already owed before
    payday". It is labelled "planned by you". Planned money in is never
    payday: payday is expected recurring income (ADR-042 item 1).
  - **When its day comes** the plan stays on its day, labelled "planned, not
    confirmed", and moves no balance or day total. The person chooses "It
    happened", which adds a manual transaction on that day with the plan's
    category (ADR-050's balance rule applies), or removes it. Nothing
    happens to it automatically.
  - **No double entry.** The transaction takes the plan's id, so confirming
    twice or retrying after a failure adds one row.
- **Alternatives considered:** Future-dated rows in `transaction` with a
  "planned" status. Rejected: every reader of transactions (balances,
  budgets, Insights, recurring detection, the agent) would need a filter,
  and one missed filter shows money that does not exist yet. Plans that
  disappear once their day passes. Rejected: the person loses track of
  what they meant to log.
- **Consequences:** A new table and migration (0013). An unconfirmed plan
  older than the calendar's window (two months back) is no longer shown;
  it stays stored until the account or workspace is deleted. Editing a plan
  means removing and re-adding it for now. The agent does not read plans.

### ADR-103: Built-in category keywords when no saved rule matches (refines ADR-013)

- **Status:** Proposed (2026-10-11)
- **Context:** ADR-013 sends anything no saved rule matches to
  "Uncategorized", and a new workspace has no saved rules. So "Choose for
  me" on the day panel, a plan's category and every imported row ended up
  Uncategorized until the person wrote rules by hand.
- **Decision:**
  - Code ships a short keyword list per preset category
    (`src/features/categorization/domain/starter-rules.ts`): "coffee",
    "lunch" → Dining; "uber", "bus pass" → Transport; "rent" → Housing;
    "paycheck" → Income; and so on.
  - A keyword matches whole words of the normalized merchant name, in a
    row ("gas" never matches "Las Vegas"). It is a rule with match type
    `word`, which only built-in keywords use; people still save
    `contains`, `starts_with` or `exact` rules.
  - Built-in keywords rank below every saved rule, so the person's own
    rules and manual choices always win. Among themselves a keyword of more
    words wins ("uber eats" is Dining, "uber" is Transport).
  - They are not stored. Every reader that chooses an automatic category
    (the Categorization page, budgets, Insights, new transactions, plans)
    appends them to the saved rules, so all of them agree.
  - Each keyword must be right almost always; a wrong guess is worse than
    Uncategorized. No AI is involved.
- **Alternatives considered:** Gemini picking the category: ADR-040 keeps
  real users' data away from Gemini until the paid key, and it adds
  latency. Removing "Choose for me": every entry would need a choice.
- **Consequences:** Rows that were Uncategorized may now show a category
  on the Categorization page, budgets and Insights at once. The calendar
  reads the stored `category_id`, so older rows change there only when the
  rules are next applied (any rule change or `applyCategoryRules`). A
  workspace has at most `MAX_RULES` saved rules plus the built-in ones, so
  the engine accepts up to 2,000 rules.

---

### ADR-104: Quiet hours per user, in Eastern time; UNDO takes back the latest text change (refines ADR-038, ADR-064)

- **Status:** Proposed (2026-10-11)
- **Context:** ADR-038 lets users set quiet hours on the website and by
  text, and the text confirmation says "Reply UNDO to go back". ADR-064
  already gives UNDO a meaning: remove the latest spending logged by text.
  ADR-038 also says "the workspace time zone", but nothing stores a time
  zone yet; every "today" in the app uses `DEFAULT_TIME_ZONE`.
- **Decision:**
  - Quiet hours are stored per user in `notification_setting`, not per
    phone, so they survive unlinking and linking again. No row means the
    default, 9 PM to 9 AM. They are minutes after midnight; a database
    check keeps both in range and different.
  - They are read in `DEFAULT_TIME_ZONE` (Eastern) until users or
    workspaces have a time zone; the website and the agent say "Eastern
    time". `nextAllowedSend` keeps the end time on the wall clock across
    daylight saving changes.
  - A text that mentions "quiet hours" is read by code before logging,
    which would otherwise read its times as amounts. With no times it
    tells the person their current hours. Without AM or PM, only the
    24-hour form ("23:00", "07:00") is accepted; anything else gets an
    example and changes nothing.
  - **UNDO takes back whichever came last within 24 hours**: the latest
    quiet-hours change made by text or the latest spending logged by text.
    A quiet-hours change can be undone once. A change on the website clears
    the text change's UNDO.
- **Alternatives considered:** No UNDO for quiet hours (simpler, but
  ADR-038's reply promises it); a separate word such as "UNDO QUIET" (one
  more thing to remember).
- **Consequences:** Adds migration 0016. The job tick (F-22, F-26) must call
  `nextAllowedSend` with the user's quiet hours before sending. A user
  outside Eastern time gets quiet hours in Eastern time until time zones
  are stored.

### ADR-105: Subscription alerts and bill reminders by text: DETAILS for amounts, a reply confirms (refines ADR-030, ADR-038, ADR-041, ADR-058, ADR-063)

- **Status:** Proposed (2026-10-11), from Simon. **Muhammad (owner of F-10
  and Bills) should confirm** the parts that touch ADR-058 and ADR-063.
- **Context:** F-26 (subscription alerts) and F-22 (bill reminders) need
  Reeflect to text first. ADR-038 puts a proactive text's amounts in an
  attached image card unless a kickoff test showed that iOS lock screens
  show readable thumbnails; that test was never recorded, and the worker's
  `/send` is text only. ADR-058 says a detected subscription is only a
  suggestion until the user confirms it. ADR-041 proposed the worker as
  the job clock.
- **Decision:**
  - **Amounts by DETAILS, no image card.** A proactive text names the
    subscription or bill and the date but never an amount; a saved name
    that holds a digit or a currency sign is replaced by a generic word.
    The user replies DETAILS and gets the amounts as an answer to their
    own request, which ADR-038 already allows. The bill answer includes
    ADR-030's low-balance sentence when checking plus savings is below
    what is left to pay, and says "about" and "estimate" when no invoice
    amount was entered.
  - **Subscription alerts go out for suggestions.** A payment that code
    suggests as a subscription (kind `subscription`, decision `candidate`,
    active) is texted once. The reply **is** the confirmation ADR-058
    requires: KEEP confirms it and marks Keep; CANCEL confirms it and marks
    Planning to cancel (Reeflect never cancels anything); IGNORE or NOT
    MINE dismisses it. A text reply only ever answers the most recent alert
    sent to that phone in the last 72 hours, and only whole-message
    replies count.
  - **Bill reminders read Bills cycles (ADR-063).** A confirmed bill cycle
    due within seven days (counting today) that is not `paid`,
    `marked_paid` or `no_payment_due` is reminded once, using the cycle's
    due date. The check is repeated just before sending, so a bill paid in
    between is not reminded. A cycle without an invoice amount is reminded
    as an estimate.
  - **Outbox.** `proactive_message` keeps one row per subscription or bill
    cycle (unique per workspace, kind and subject), with its status and
    when it may be sent; it stores no amounts and no text. Before sending,
    the phone must still be linked and opted in, the type switched on,
    quiet hours over (ADR-104) and fewer than three texts sent to that
    user since midnight Eastern; otherwise it waits (or is cancelled). A
    failed send is tried three times, five minutes apart. Each row is
    locked while it is sent, so two ticks cannot send it twice.
  - **Each type can be switched off** on Settings → Notifications
    (`notification_setting.subscription_alerts`, `bill_reminders`, both on
    by default), as ADR-038 asks. The opt-in on the Messages card still
    governs both.
  - **Job clock (makes ADR-041's Proposed part Accepted for this use).**
    The worker posts `/api/jobs/tick` every five minutes with the service
    token; Vercel Cron calls it once a day with `CRON_SECRET` as a backup.
    The route takes no input: it works only on verified, opted-in phones.
- **Alternatives considered:** The image card (needs image rendering,
  signed URLs and attachments in the worker, for a privacy gain DETAILS
  already gives); alerting only after the user confirms on the website
  (the alert would tell them what they already know); a daily Vercel Cron
  only (a text held by quiet hours would wait until the next day).
- **Consequences:** Adds migration 0018 and the `alerts` feature. A user
  with many suggestions at once receives them three a day. Undoing KEEP,
  CANCEL or IGNORE by text is not built; the Recurring payments page can
  change all three. The weekly recap and stale Nessie syncs are not on the
  tick yet.

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

### ADR-060: Monthly budget interactions and recorded actual spending (refines ADR-015)

- **Status:** Accepted (2026-10-11), user approved the complete monthly-budget plan.
- **Context:** recurring patterns describe repeating payments, while Insights
  shows rolling averages. Users also need to compare a deliberate category
  allocation with recorded spending for one calendar month. The feature must
  stay independent of concurrent dashboard and Insights work.
- **Decision:**
  - Keep budgets on their own page. One allocation per workspace, spending
    category and calendar month; nonnegative USD cents. Zero is a saved plan,
    distinct from removing a budget.
  - Default to the current month in the existing app zone, America/New_York.
    Inspect historical months read-only; edit this month or next month. Do not
    add workspace time-zone settings under this feature.
  - Actuals use posted ledger dates: through today for this month, the full
    range for historical months, and no future actuals. Current rules and
    manual choices determine effective categories; renaming preserves IDs.
  - Refunds reduce spending, including negative net spending. Exclude marked
    transfers, Income, Retirement and Investing using the current category
    definitions. Unknown credits are not inferred refunds. Show Uncategorized
    and unbudgeted spending, and state that these are recorded activity totals.
  - Explicit copying fills missing allocations only; preserve existing zero
    and nonzero allocations. Copy is atomic and repeatable, without rollover.
  - Viewers read; editors and owners write. Budget operations change metadata,
    never ledger rows or balances. Consistent bounded reads fail into a local
    retry state rather than returning partial or fabricated zero totals.
- **Alternatives considered:** editing past allocations (changes saved history);
  automatic rollover/overwrite (changes the user's plan); using Insights'
  rolling averages as actuals (different date range); inferring transfers
  from merchant text (ambiguous, belongs to transfer pairing).
- **Consequences:** F-09 is independent of the calendar and recurring estimates.
  Historical actuals can change when current categorization changes, while
  saved allocation amounts stay in their original months. Accuracy depends
  on recorded coverage and transfer marks. Apply migration 0010 to the intended
  deployment database before deploying the new page. Agent budget replies
  remain separate work.


### ADR-063: Web Bills tracks invoices and explicit payment evidence

- **Date:** 2026-10-11
- **Status:** Accepted
- **Owner:** Muhammad Tahub Khatri
- **Context:** The user approved the revised web-only Bills plan and requested
  implementation. Recurring patterns describe typical payments; variable
  invoices need their own amount, due date and explicit payment state. Claude
  owns the agent, Simon the dashboard and Jacob Insights/mock data.
- **Decision:**
  - Implement the complete Bills website only. Keep ADR-058's pattern detector
    and canonical recurring schedules, with no new merchant or amount rules.
  - Store current invoices separately from long-term estimates. Unknown differs
    from zero. Keep a stable scheduled-date identity and original month-end
    anchor; correcting a due date changes one invoice, not another obligation.
  - Project at most 90 days on read, using America/New_York as elsewhere in the
    app. Predictions are expected dates; explicit invoice dates are due dates.
    Do not manufacture past unpaid obligations from imported history.
  - Require explicit user confirmation to link owned posted outflows by payment
    account, normalized payee and neighboring-cycle window. Do not allocate a
    transaction twice. Sum valid partial payments in cents; show overpayment
    without allocating excess. Pending/future rows and refunds are not proof.
  - Permit explicitly configured debt repayment transfers without reclassifying
    them as spending. Autopay is an annotation. Manual paid marks are reversible
    and separate from posted evidence; an invoice correction clears an old mark.
    Changed/deleted evidence requires review and contributes no copied amount.
  - Compare recorded checking/savings cash with open cash-funded bills over
    30 days plus unresolved user-dated past invoices. Separate known invoices
    from estimates, show balance dates and account filters, and state that
    everyday spending and one-off plans are outside these totals.
  - Viewers read, editors/owners write. Preserve history when stopping/restoring
    tracking or converting kind. Use ownership constraints, atomic transactions,
    revisions and bounded reads/writes. Never mutate transactions or balances.
- **Alternatives considered:** treating an estimated charge as an invoice;
  applying a fixed amount tolerance to variable utilities; automatic settlement
  from a nearby charge; creating years of historical unpaid invoices; extending
  into the independently owned dashboard and message delivery.
- **Consequences:** Migration 0014 adds bill details, cycles and evidence. The
  Bills page has its own error/retry boundary and tests. This decision applies
  to the web invoice experience; ADR-030's automated reminder matching and
  delivery are unchanged. No worker, messaging, AI, cron, job, notification
  preferences or dashboard integration is implemented here. Those integrations
  must explicitly adopt these invoice semantics if they consume the public API.

### ADR-066: Explicit web transfer review and reversible pair relationships

- **Status:** Accepted (2026-10-11), user authorized the supplied implementation plan.
- **Context:** Imported repayments can be counted twice. Transfer labels have
  no provenance, and Bills evidence snapshots include the transfer flag.
- **Decision:** Review existing transactions on a Transactions subroute.
  Suggest equal/opposite posted amounts on different owned accounts within
  three calendar days (ADR-020); the user chooses and confirms every pair.
  Review reads never classify automatically; this feature adds no import hook.
  Pair exactly two rows atomically.
  Remove pairing clears only the relationship and keeps each transfer label;
  counting standalone rows as normal activity is a separate explicit action.
  Legacy/orphan groups remain visible and require explicit detachment, with
  no ownership inferred from pair IDs and no automatic repair on reads.
  Classification changes no ledger fact or recorded balance. Serialize writes
  with Bills' workspace advisory lock before deterministic transaction locks.
  Reject stale/competing forms and flag changes on allocated payment evidence.
  Paired financial fields/flags cannot be edited until detachment; deletion
  preserves the existing balance undo and detaches surviving owned members.
- **Consequences:** Reuse existing transfer fields with no migration. Removing
  pairing alone does not return amounts to spending/income. Bill evidence must
  be explicitly unlinked before reclassification; labelled debt repayments
  may gain/lose a relationship without changing that evidence. Default review
  covers 90 days with explicit bounded older-date/account navigation.
  The user approved the focused cashflow correction: liquid transfer amounts
  move historical and daily balances without becoming spending or income.
