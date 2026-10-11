# HANDOFF

The running log between sessions, people, and agents. Newest entry at the
bottom.

## Rules

- **Start of every session:** read the latest entry and the Assignments table.
- **End of every session:** append a new entry using the template below, even
  if work is unfinished or the session ended early.
- Entries are numbered HO-001, HO-002, … and never edited after being written
  (add a new entry to correct an old one).
- Keep each entry short and factual. Link PRs, issues, and ADRs instead of
  repeating them.

## Template

```markdown
## HO-0XX: <one-line summary>

- **Date:** YYYY-MM-DD HH:MM (timezone)
- **Author:** <person> with <agent>
- **Branch / PR:** <branch name> / <PR link or "not opened">

### What changed
- …

### What's next
- …

### Open problems
- … (or "None")
```

## Assignments

Update this table when work is assigned or finished. Features are listed in
`PROJECT.md` section 5.

| Feature / bug | Lane | Assigned to | Branch | Status |
|---|---|---|---|---|
| Scaffold (Next.js, pnpm workspace, Drizzle, Better Auth, CI, lefthook) | All | Unassigned | — | Next.js, CI, Drizzle and Better Auth done (HO-017, HO-018). Not done: lefthook, the `agent-worker/` and `packages/` workspace packages |
| F-01 Sign up / sign in | B | Simon Ormond | `feat/email-verification-resend` | Done (HO-018, HO-020, HO-021, HO-027); email verification and password reset through Resend (HO-034, ADR-052 Proposed) |
| F-02 Personal workspace | B | Simon Ormond | `feat/personal-workspace` | Personal workspace and `/w/[workspaceId]` done (HO-027); household later |
| F-03 Financial accounts | A | Simon Ormond | `feat/financial-accounts` | Done: manual accounts, list, edit, delete (HO-030) |
| F-04 Manual transactions | A | Simon Ormond | `feat/manual-transactions` | Built: add, edit, delete, list by day, account filter (HO-031); ADR-050 Proposed |
| F-05 CSV import | A | Simon Ormond | `feat/csv-statement-import` | Built for Capital One 360 and credit-card CSV exports (HO-040, ADR-054 Proposed); no mapping screen yet |
| F-06 PDF statement import (P0, ADR-044) | A | Simon Ormond | `feat/pdf-statement-import` | Built for Capital One 360 checking and savings (HO-038); CSV kept in Neon object storage (ADR-053 Proposed); needs `neon deploy` and Vercel vars |
| F-08 Categorization | A | Codex | `feat/transaction-categorization` | Full feature merged in PR #12 (HO-037) |
| F-09 Monthly budgets (P1) | A | Codex | `feat/monthly-budgets` | Complete page and persistence built; validation and migration rollout recorded in the latest handoff |
| F-10 Recurring payments (detection P0, marks P1) | A | Codex | `feat/subscriptions` | Full website built (HO-045, ADR-058); local checks pass; external Neon storage regressions pending |
| F-12 Calendar home screen | B | Simon Ormond | `feat/real-cashflow-dashboard` | On real accounts and transactions (HO-048); paydays, bills and subscriptions not yet read from recurring payments (F-10) |
| F-13 Drill-down | B | Simon Ormond | `feat/real-cashflow-dashboard` | Day panel adds and removes real typed transactions (HO-048) |
| F-18 Themes and accessibility | B | Unassigned | — | Not started |
| F-19 Delete data | B | Unassigned | — | Not started |
| F-21 Demo seed (incl. Nessie) | A | Jacob Heminway | — | Synthetic generator and batch scripts merged (HO-026, PR #7); Nessie seeding and `pnpm db:seed` not started |
| F-23 Nessie import and sync | A | Unassigned | — | Not started |
| F-24 Phone linking | C | Muhammad Tahub Khatri | `feat/photon-agent` | Built (HO-032); real texts need the worker (F-32) |
| F-25 "How am I doing?" + week-ahead image | C | Muhammad Tahub Khatri | `feat/agent-answers` | Answers built (HO-050): balances and the last 30 days. Owed before payday, the per-day figure and the image wait for bills and paydays |
| F-26 Subscription alerts | C | Unassigned | — | Not started |
| F-27 Log spending by text | C | Unassigned | — | Not started |
| F-28 Category and balance questions | C | Unassigned | — | Not started |
| F-32 Agent worker | C | Muhammad Tahub Khatri | `feat/agent-worker` | Done, replies only (HO-039, PR #17); live on Render (HO-049) |
| F-22 Bill reminders (P1) | A + C | Unassigned | — | Not started |
| F-15 Gemini summary on the website (P1, ADR-045) | C | Unassigned | — | Not started |
| F-35 Compare with people like you (Later, ADR-056) | A + B | Jacob Heminway | `feat/insights` | Built: the Insights page, stored sample figures and `pnpm batch rollup` (HO-043); ADR-056 and ADR-057 Proposed |
| F-36 Retirement question (Later, ADR-055) | B | Jacob Heminway | `feat/insights` | Planned; generator models the answers (HO-041) |
| Later (ADR-043): Plaid, household, debt tab, savings goal, receipt photos, recaps, forecast, audit log | — | Unassigned | — | Only if time remains |

---

## HO-001: Project documentation created

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (claude.ai chat)
- **Branch / PR:** not yet in a repository

### What changed
- Created `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `docs/PROJECT.md`,
  `ARCHITECTURE.md`, `DECISIONS.md`, `HANDOFF.md`, `TESTING.md`.
- Added CI, CodeQL and nightly external-test workflows, the `main` ruleset
  definition, PR template, `.coderabbit.yaml`, `lefthook.yml` (hook config;
  install lefthook during scaffolding), and `.env.example`.

### What's next
1. Team reviews every **Proposed** ADR in `DECISIONS.md` and marks each
   Accepted or replaces it. Highest priority: ADR-005 (database), ADR-007
   (workspaces), ADR-012 (Plaid), ADR-014 (recurring rule), ADR-016 formulas.
2. Choose the product name (ADR-002); set `APP_NAME`.
3. Create the GitHub repository; commit these files on a `docs/initial`
   branch and merge by PR.
4. Import `.github/rulesets/main.json` as a repository ruleset; enable
   secret scanning with push protection; install CodeRabbit.
5. Create accounts and keys: Neon database, Plaid Sandbox, AI provider. Put
   them in Vercel and local `.env` (never committed).
6. Scaffold the app so every command in AGENTS.md section 5 exists, then
   confirm CI passes on an empty test suite.
7. Assign features in the Assignments table.

### Open problems
- If the repository is private, CodeQL and dependency review may need GitHub
  Advanced Security; decide public vs. private.
- P0 scope is large for 24 hours with three people; confirm the priority
  split in `PROJECT.md` at kickoff.

---

## HO-002: All ADRs accepted; Postgres, Plaid, and pitch confirmed

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (claude.ai chat)
- **Branch / PR:** not yet in a repository

### What changed
- Team accepted every ADR (ADR-001 to ADR-026); statuses updated in
  `DECISIONS.md`.
- ADR-005: PostgreSQL on Neon with Drizzle confirmed; MariaDB dropped.
- ADR-014: tightened recurring rule confirmed (3+ charges, regular spacing,
  amounts within ±15%).
- ADR-012: expanded into the full Plaid integration decision; ARCH-11 added
  to `ARCHITECTURE.md` with the link and sync flow.
- ADR-002: leading name candidate "Stillfint" (stillfint.com) recorded; not
  final.
- Added `docs/PITCH.md`: one-line pitch, demo script, judge Q&A, claims to
  avoid, sponsor angles, pre-stage checklist.

### What's next
1. Final product name decision, then trademark and domain check; set
   `APP_NAME`.
2. Confirm the P0/P1/P2 feature split in `PROJECT.md` section 5 at kickoff
   (not an ADR; still open).
3. Decide the answer to "How would this make money?" before the demo
   (`PITCH.md` section 6).
4. Remaining steps from HO-001, items 3 to 7.

### Open problems
- Repository visibility (public vs. private) still undecided; affects CodeQL.

---

## HO-003: Preview fallback for unbuilt features

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (claude.ai chat)
- **Branch / PR:** not yet in a repository

### What changed
- Added ADR-027: features not built in time become frontend previews with
  sample data, behind `NEXT_PUBLIC_ENABLE_PREVIEWS`, isolated in `preview/`
  folders.
- PITCH.md and PROJECT.md updated to match.
- Name candidate "Stillfin" dropped (used by a tax advisor); "Stillfint"
  still possible. Name still open.

### What's next
1. Choose the product name (ADR-002).
2. Team decides on the "Preview" badge (ADR-027, Proposed part).
3. Decide the revenue model answer for PITCH.md section 6.

### Open problems
- None new.

---

## HO-004: Product name chosen

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (claude.ai chat)
- **Branch / PR:** not yet in a repository

### What changed
- ADR-002: product named **Reeflect**; AGENTS.md, PROJECT.md and PITCH.md
  updated.

### What's next
1. Decide the production domain (reef-lect.com, reeflect.app,
   getreeflect.com); use the Vercel subdomain for the demo meanwhile.
2. Set `APP_NAME = "Reeflect"` during scaffolding.

### Open problems
- Trademark search on "Reeflect" not done yet (needed before public launch).

---

## HO-005: Decisions closed; kickoff-only build plan

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (claude.ai chat)
- **Branch / PR:** not yet in a repository

### What changed
- ADR-027: "Preview" badge confirmed.
- ADR-028 (new): revenue model is freemium plus licensing to banks.
- ADR-029 (new): no project work before the hacking window; this entry's
  runbook replaces the "before the event" steps in HO-001.
- ADR-002: hackathon domain is the free Vercel subdomain; USPTO search found
  a registered "REEFLECT GLASS PROTOTYPING EXPERTS" mark (classes 012, 021,
  040, 042). Low risk for the hackathon; attorney review before any launch.
- ADR-019: AI provider is the Google Gemini API (`@google/genai`,
  `GEMINI_API_KEY`). Free tier allowed only with synthetic data.
- The P0/P1/P2 split will be confirmed at kickoff.

### Allowed before the event
- [ ] Neon account and project created; connection strings saved privately
- [ ] Plaid account with Sandbox keys
- [ ] Google AI Studio account and Gemini API key
- [ ] Vercel account; GitHub accounts for all three teammates; CodeRabbit
      access
- [ ] Optional: tooling rehearsal in a throwaway public repository with no
      Reeflect code, deleted afterwards (ADR-029)

### Kickoff runbook (first hour of hacking)

| Minute | Step | Who |
|---|---|---|
| 0–5 | Create the public GitHub repository `reeflect`; add teammates | One person |
| 5–10 | Commit this bundle on branch `docs/initial`; open PR; merge (rules not active yet) | Same person |
| 10–15 | Import `.github/rulesets/main.json`; enable secret scanning and push protection; install CodeRabbit on the repository | Same person |
| 0–15 (parallel) | Confirm the P0/P1/P2 split and fill the Assignments table | Other two |
| 15–40 | Scaffold on branch `chore/scaffold` with an agent: Next.js, TypeScript strict, pnpm, ESLint, Prettier, Vitest, Playwright, Drizzle, Better Auth, lefthook, every script in AGENTS.md section 5, `APP_NAME = "Reeflect"` | One person |
| 15–40 (parallel) | Add secrets to Vercel; connect the repository to Vercel; prepare synthetic fixtures | Other two |
| 40–55 | Open the scaffold PR; get all required checks green; teammate approves; squash-merge | Whole team |
| 55–60 | Everyone branches from `main` for their first assigned feature | Whole team |

### Open problems
- Confirm HackNC's own rules on pre-event preparation (check the event
  guide or ask organizers on Discord).

---

## HO-006: Bill due-date reminders added

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (claude.ai chat)
- **Branch / PR:** not yet in a repository

### What changed
- New feature F-22 (PROJECT.md) and ADR-030: reminders 7 days before
  recurring obligations (car payments, mortgage, rent, loans, card minimums)
  are due, with low-balance warnings and paid-bill suppression.
- Recurring series now split into `subscription` (snails) and `bill`
  (reminders). ARCH-12, data model, TEST-04 and TEST-07 updated.

### What's next
1. Team accepts or changes ADR-030 at kickoff, including its P1 priority.

### Open problems
- The iMessage agent, Nessie data source and revised P0 are still proposals
  from chat and are not yet in these docs.

---

## HO-007: iMessage agent and Nessie confirmed

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (claude.ai chat)
- **Branch / PR:** not yet in a repository

### What changed
- Accepted: ADR-031 (iMessage agent on Photon Spectrum), ADR-033 (Nessie as
  a data source; mechanism Proposed), ADR-036 (tracks: General, Photon,
  Nessie).
- Proposed for kickoff: ADR-032 (worker + Next.js brain), ADR-034 (phone
  linking), ADR-035 (agent number rules), ADR-037 (revised scope and lanes),
  ADR-038 (proactive message rules).
- PROJECT.md features rewritten (F-23 to F-32 added, priorities per
  ADR-037); ARCHITECTURE.md ARCH-13 and ARCH-14 added; TESTING.md, AGENTS.md,
  `.env.example`, CI env, `.coderabbit.yaml` updated; PITCH.md rewritten
  around the agent.

### Lane milestones (hours from the start of hacking)

| Hour | Lane A: Data | Lane B: Web | Lane C: Agent |
|---|---|---|---|
| 1 | Kickoff runbook done; CI green | Same | Same |
| 4 | Nessie client and mapping with tests | Sign-in, workspace, empty tank | Worker relays to `/api/agent/turn` in the terminal provider |
| 6 | Nessie sync into a real `FinancialSnapshot` | Tank renders from fixture `TankState` | Phone linking works end to end |
| 10 | Budgets, categories, snails from real data | Tank renders real data; drill-down | "How am I doing?" answered in iMessage, text only |
| 14 | Demo seed complete | Previews for cut features | Tank image and snail alert in iMessage |
| 18 | Bill reminders (P1) | Polish, accessibility checks | "12 lunch" logging; bill reminder delivery (P1) |
| 20 | Feature freeze | Feature freeze | Feature freeze |
| 20–24 | Rehearse demo; Devpost | Same | Same |

### Kickoff runbook additions (to HO-005)
- Worker deployed to the chosen host with Photon and agent secrets by minute
  50; a test text from a teammate's phone answered before minute 60.
- Nessie key and base URL confirmed against Nessie's interactive docs.
- `npx skills add photon-hq/skills` run in the repository.

### Open questions (answer before or at kickoff)
Record each answer as an ADR status change. "Rec." is Claude's
recommendation, not a decision.

| # | Question | Rec. | ADR |
|---|---|---|---|
| Q1 | Accept the worker + Next.js brain design? | Yes | ADR-032 |
| Q2 | Worker host: Railway or Render? | Railway, or Render's paid tier; free tiers that sleep add delay to replies | ADR-032 |
| Q3 | Repository as a pnpm workspace with `agent-worker/` and `packages/agent-protocol/`? | Yes | ADR-032 |
| Q4 | If HackNC teams get no Photon iMessage line, what is the fallback? | Ask in Photon's sponsor channel first; fall back to Telegram through the same Spectrum code | ADR-031 |
| Q5 | Agent channels beyond iMessage? | iMessage only (plus terminal for development) | ADR-031 |
| Q6 | Accept phone linking by texting a one-time code? | Yes | ADR-034 |
| Q7 | Let judges text the agent from their own phones? | Yes, through a demo-only "Try it" code that links their phone to a sandbox workspace | ADR-034 |
| Q8 | Keep / cancel by text replies, with reactions only if Spectrum delivers them? | Yes | ARCH-13 |
| Q9 | Hide amounts in proactive messages on the lock screen? | Yes; show amounts in replies to the user's own questions | ADR-038 |
| Q10 | Quiet hours 9 PM–9 AM and at most 3 proactive messages a day? | Yes | ADR-038 |
| Q11 | Agent refuses non-finance topics? | Yes (added by Claude; not yet confirmed) | PROJECT §7 |
| Q12 | Agent name and voice: "Reeflect", friendly, sparing emoji? | Yes | ADR-031 |
| Q13 | One auto-created Nessie customer per workspace via "Connect Capital One sandbox"? | Yes | ADR-033 |
| Q14 | Plaid moves to P1? | Yes | ADR-037 |
| Q15 | Accept bill reminders (ADR-030) as P1? | Yes | ADR-030 |
| Q16 | Also enter MLH Best Use of Gemini API? | Yes; no extra work | ADR-036 |
| Q17 | Also enter Frutiger Aero (changes the visual style) or MLH .Tech Domain? | Ask organizers whether a project can enter both General and Frutiger Aero; skip .Tech unless free | ADR-036 |
| Q18 | Enable Gemini billing (paid tier) for the demo? | Yes, with a low spending cap: avoids free-tier rate limits during judging | ADR-019 |

---

## HO-008: Answers to Q1–Q18; aquarium design under review

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (claude.ai chat)
- **Branch / PR:** not yet in a repository

### What changed
| Q | Answer | Recorded in |
|---|---|---|
| Q1 | Worker + Next.js brain accepted | ADR-032 Accepted |
| Q2 | Worker on Render | ADR-032 (always-on instance needed; see open problem 2) |
| Q3 | pnpm workspace accepted | ADR-032 |
| Q4 | Team delegated: Telegram through Spectrum is the fallback channel | ADR-031 |
| Q5 | iMessage only for now; pitch says expansion later | ADR-031, PITCH |
| Q6 | Phone linking accepted | ADR-034 Accepted |
| Q7 | Judge "Try it" flow accepted; documented step by step | ADR-034, PITCH |
| Q8 | Not yet answered (explained in chat) | ARCH-13 keeps typed replies; tapbacks pending |
| Q9 | Hide amounts on the lock screen; show them once opened | ADR-038 (image-card approach, test at kickoff) |
| Q10 | Quiet hours settable on the website and by iMessage command | ADR-038, F-33 |
| Q11 | Agent declines non-finance topics | ADR-031, PROJECT §7 |
| Q12 | Agent named Reeflect; friendly voice, sparing emoji | ADR-031 |
| Q13 | Nessie connection and sync mechanism accepted | ADR-033 Accepted |
| Q14 | Plaid P1 | ADR-037 |
| Q15 | Bill reminders P1 | ADR-030 Accepted |
| Q16 | Enter MLH Best Use of Gemini API | ADR-036 |
| Q17 | No .Tech Domain, no Frutiger Aero | ADR-036 |
| Q18 | No Gemini paid tier | ADR-039 (fast path, fallback, caching) |

- ADR-016 and ADR-017 marked "under review": the team may drop the aquarium
  design.

### What's next
1. Decide the aquarium question (see open problem 1).
2. Answer Q8 (typed replies vs. tapbacks).
3. Confirm ADR-035 (agent number rules) and ADR-037 (P0 list) at kickoff.

### Open problems
1. **Aquarium design under review.** Affects ADR-016, ADR-017, F-12, F-13,
   F-17, F-25 (tank image), PITCH.md, and possibly the name's "reef" pun.
   Lane B should not build tank visuals until this is decided.
2. **Render plan.** Free web services sleep after 15 minutes without inbound
   traffic; the worker's Photon connection is outbound, so it would miss
   messages. Confirm paying for the Starter instance (about $7/month) for the
   event, or choose another always-on host.
3. **Lock-screen test** at kickoff: does the iOS notification show a readable
   image thumbnail? If yes, switch proactive messages to "Reply DETAILS".

---

## HO-009: Render keep-awake, Gemini without limits, aquarium mockup

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (claude.ai chat)
- **Branch / PR:** not yet in a repository

### What changed
- ADR-041: the Render free tier is kept awake by a self-ping every 10
  minutes plus a free external uptime monitor. Vercel Hobby cron runs only
  once a day, so it cannot do this. Proposed: the worker also acts as the
  5-minute job clock for the app.
- ADR-040 supersedes ADR-039: features are designed as if Gemini were on the
  paid tier; code still executes security-critical commands. Synthetic data
  only until the paid key exists after the hackathon.
- The aquarium decision now depends on a mockup Muhammad reviews before the
  event.

### What's next
1. Review the aquarium mockup; record the decision as a new ADR (keep the
   aquarium, or replace ADR-016 and ADR-017).
2. Before the event weekend, run `worker-idle.spec.ts` manually against a
   throwaway deployment if allowed, or in the first hours of hacking.
3. At hour 20, load-test the demo path (several phones texting at once) to
   check free-tier Gemini limits.

### Open problems
- Q8 (typed replies vs. tapbacks) still unanswered.
- Mockup must be design exploration only: no mockup code is copied into the
  repository (ADR-029).

---

## HO-010: Aquarium design mock (throwaway)

- **Date:** 2026-10-06
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `main` of the `ci-rehearsal` throwaway repository, uncommitted

### What changed
- Scaffolded Next.js 16 (App Router, TypeScript, pnpm via corepack) and built
  a static aquarium mock on the home page: SVG with Motion, synthetic data,
  three sample months. No auth, database, API routes or tests.
- Tank formulas follow ADR-016 (`src/features/tank/domain/tank-state.ts`);
  money is integer cents through `src/lib/money`.
- `next dev` appended a Next.js agent-rules block to `AGENTS.md`.

### What's next
1. Muhammad reviews the mock (`corepack pnpm dev`) and records the aquarium
   decision as a new ADR.
2. Per ADR-029, none of this code is copied into the real repository.

### Open problems
- CI workflows are unchanged and will fail on a push to `main`: the mock has
  no `format:check`, `typecheck`, `test:unit`, `test:e2e`, `scan:bundle` or
  `db:migrate` scripts.
- With `MURK_FULL_AT = 0.5`, a month $61 over a $2,300 budget gives about 5%
  murk, which is barely visible. Water clarity only reads in a bad month.
- After two review rounds ("childish", then "they look like fish"): budgets
  are glass floats that fill as they are used and gain an outer ring when
  over; subscriptions are markers on the glass; no fish shapes or decor.
  The page is full width and the tank fills the first screen, laid out from
  its measured pixel size. In-tank captions hide on narrow screens and in
  shallow water; the lists carry the text.

---

## HO-011: Cash-flow calendar mock replaces the aquarium mock

- **Date:** 2026-10-07
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `main` of the `ci-rehearsal` throwaway repository, uncommitted

### What changed
- After three aquarium rounds Muhammad judged the aquarium design not working
  and chose a cash-flow calendar instead. The home page now renders
  `src/features/cashflow/`: a "spend per day until payday" headline, a month
  calendar with paydays, bills, subscriptions and day-to-day spending, a
  balance line, a day panel with add and remove, month navigation, and a
  subscriptions list with keep / planning-to-cancel and yearly saving.
- Everything runs in the browser on synthetic data pinned to 2026-10-07.
  Nothing is saved: a reload resets it. No tests were written.
- `src/features/tank/` is still on disk but unused, and its styles were
  removed from `globals.css`.

### What's next
1. Muhammad reviews the calendar. If it is the direction, record a new ADR
   that supersedes ADR-016 and ADR-017, and decide what the iMessage agent
   sends in place of the tank image, the tagline, and the pitch script.
2. Per ADR-029, none of this code is copied into the real repository.

### Open problems
- The "per day until payday" rule (balance today minus what is due before
  the next payday, divided by the days left, rounded down) is a new formula
  with no ADR and no unit tests.
- Later months show only planned items, so the expected balance climbs
  unrealistically; the page says so in a note under the balance line.
- CI workflows are unchanged and will still fail on a push to `main`.

---

## HO-012: Calendar interactions and the three data sources (mock)

- **Date:** 2026-10-07
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `main` of the `ci-rehearsal` throwaway repository, uncommitted

### What changed
- Muhammad approved the cash-flow calendar as the design direction.
- Calendar: each day lists its activity by name, with a day total; filter
  chips by kind; a Calendar / List switch; arrow-key movement between days;
  hovering a day moves the marker on the balance line.
- Every entry now records a source (`bank`, `manual`, `text`), shown in the
  day panel. A "Three ways your money gets here" section counts entries per
  source and holds a simulated text thread. Texts are read by plain rules in
  `src/features/cashflow/domain/read-text.ts` (no AI, no Photon, no Nessie);
  amounts come only from the person's own message.

### What's next
1. Record the calendar decision as a new ADR superseding ADR-016 and ADR-017,
   and update PROJECT, PITCH and the tagline to match.
2. At kickoff, replace the simulated sources with the real Nessie sync and
   the Photon agent per ADR-032 to ADR-035.

### Open problems
- Still no tests and nothing is saved between reloads.
- The simulated agent replies include amounts. That is fine for replies to
  the user's own question, but proactive messages must not (ADR-038).

---

## HO-013: Calendar decision recorded (ADR-042); docs updated

- **Date:** 2026-10-07
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `main` of the `ci-rehearsal` throwaway repository, uncommitted

### What changed
- ADR-042 added: the cash-flow calendar replaces the aquarium. ADR-016 and
  ADR-017 are superseded; the status lines of ADR-001, ADR-026 and ADR-031
  point to ADR-042. Their Decision text was not edited.
- AGENTS, PROJECT, ARCHITECTURE, TESTING, PITCH and `.coderabbit.yaml` now
  describe the calendar: product line, feature rows F-10 to F-17, F-25, F-26,
  F-30 and F-31, PROJECT section 6, ARCH-06, the agent tool names, the image
  route, the test tables and the demo script.

### What's next
1. Team confirms or changes the six Proposed items in ADR-042.
2. Jacob and Simon read ADR-042 before kickoff; lane B's first task is F-12.

### Open problems
- Older Accepted ADRs (ADR-014, ADR-015, ADR-030, ADR-037, ADR-038, ADR-041)
  still say "snail", "tank" or "fish" in their Decision text. ADR-042 says
  how to read them; they were left as written.
- `workspace_settings.cushion_target_cents` (ARCH data model) was only used
  by the water level and has no use yet under ADR-042.
- Recurring income detection is now needed for the headline, and ADR-014
  only covers recurring charges.
- Q8 (typed replies vs. tapbacks) and the ADR-035 and ADR-037 confirmations
  from HO-008 and HO-009 are still open.

---

## HO-014: Pre-kickoff doc cleanup; `pnpm docs:check` planned

- **Date:** 2026-10-09 18:12 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `docs/pre-kickoff-cleanup` of the `ci-rehearsal` throwaway repository / not opened

### What changed
- `pnpm docs:check` added to the plan: the command table in AGENTS.md
  section 5, the `lint-typecheck` job in `ci.yml`, and TEST-09, which holds
  its six checks. The script itself is not written (ADR-029).
- `.coderabbit.yaml` cited `TESTING-03`; corrected to `TEST-03`.
- TEST-09: the `security` and `CodeQL` rows had fallen out of the CI table;
  moved back in.
- The doc edits from HO-013 are now committed on this branch.

### Kickoff runbook additions (to HO-005 and HO-007)
- Minute 5–10: copy only `docs/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
  `.coderabbit.yaml`, `.github/`, `lefthook.yml` and `.env.example` into the
  new repository. Leave the mock behind: `src/`, `public/`, `package.json`,
  the lockfile and the Next.js config files.
- Minute 15–40: the scaffold includes `scripts/docs-check` and the
  `docs:check` script, built to the list in TEST-09. `lint-typecheck` stays
  red until it exists.

### What's next
1. At kickoff, follow the HO-005 runbook with the additions above.
2. Run `pnpm docs:check` once it exists and fix whatever it reports.

### Open problems
- The Assignments table still names F-10 "Recurring snails", F-12 "Tank hero
  panel" and F-25 "tank image"; ADR-042 renamed these. Update the table when
  assignments are filled in at kickoff.
- The open problems in HO-013 still stand.

---

## HO-015: Next.js scaffolded; plain CSS, no Tailwind

- **Date:** 2026-10-10 12:01 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `main` (uncommitted working tree, by the user's choice) / not opened

### What changed
- Repository created with `create-next-app`: Next.js 16.4, App Router,
  TypeScript strict, ESLint, `src/`, `@/*` alias, pnpm (ADR-003). One initial
  commit on `main`; `origin` is connected.
- Tailwind removed (uncommitted): styling is plain CSS, with global rules in
  `src/app/globals.css` and CSS Modules per component. This matches the
  "HTML and CSS" rendering line in ADR-042.
- `pnpm build`, `pnpm lint` and `tsc --noEmit` pass.

### What's next
1. Move the uncommitted Tailwind removal to a branch and commit it.
2. Finish the scaffold: the remaining AGENTS.md section 5 scripts, Prettier,
   Vitest, Playwright, Drizzle, Better Auth, the pnpm workspace packages, CI
   and `src/config/app.ts`.
3. Replace the stock starter page with the calendar home screen.

### Open problems
- The plain-CSS choice is not written in AGENTS.md or as an ADR, so other
  agents may reach for Tailwind.
- No tests exist yet; the starter page has none.
- The open problems in HO-014 still stand.

---

## HO-016: Tailwind kept; CI added; scope refocused (ADR-043 to ADR-046)

- **Date:** 2026-10-10 13:00 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `main` (uncommitted working tree, by the user's choice) / not opened

### What changed
- Corrects HO-015: Tailwind was **not** removed. It stays installed as a
  fallback; plain CSS with tokens and CSS Modules is the default (ADR-046).
- New ADRs: ADR-043 (scope: calendar, statement parsing, Nessie, iMessage
  agent first; supersedes ADR-037), ADR-044 (CSV and PDF both built, parsed
  by code only; supersedes ADR-011), ADR-045 (Gemini summary on the website),
  ADR-046 (styling). PROJECT, ARCHITECTURE, TESTING, PITCH and AGENTS.md
  updated to match.
- CI: `.github/` copied from the pre-event templates and adapted. Jobs
  `lint-typecheck`, `unit`, `e2e`, `security` and `codeql` run on every pull
  request. Added Prettier, Vitest, Playwright, `scripts/docs-check.ts`,
  `scripts/scan-bundle.ts` and their tests, and one Playwright smoke test.
  All AGENTS.md section 5 scripts exist and pass locally.
- Also copied: `CLAUDE.md`, `GEMINI.md`, `.coderabbit.yaml`.

### What's next
1. Commit this work on a branch and open a PR; watch the first CI run, since
   the workflows have only been run command by command on a laptop.
2. Import `.github/rulesets/main.json` in the repository settings so `main`
   is protected and the five checks are required.
3. Build the Capital One PDF template first (ADR-044).
4. Settle the Nessie approach (see Open problems).
5. Add the Drizzle schema, then the database steps in CI (TEST-09).

### Open problems
- Commit 6525b1b on `main` loads the Nessie jQuery SDK in the browser from
  the root layout. ADR-033 says Nessie is called from the server only,
  because the key travels in the URL. Muhammad confirmed ADR-033 stands, but
  the team is still working out Nessie: keep `public/lib` and the `<Script>`
  tag in place for now and do not remove them without asking.
- `main` is not protected: that commit was pushed straight to it.
- PITCH.md section 5 has no statement-upload step yet; the pitch is being
  revisited later.
- `lefthook.yml` and `.env.example` from the templates were not copied.
- The open problems in HO-014 still stand.

---

## HO-017: Drizzle and the database connection set up

- **Date:** 2026-10-10 13:15 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `main` (uncommitted working tree, by the user's choice) / not opened

### What changed
- Drizzle ORM with the `pg` driver (ADR-005): `src/lib/db/client.ts`, an
  empty schema in `src/lib/db/schema/`, and an empty first migration in
  `src/lib/db/migrations/`. `pnpm db:generate` and `pnpm db:migrate` exist.
- `src/lib/env.ts` validates `DATABASE_URL` (runtime, Neon's pooled string)
  and the optional `DATABASE_URL_UNPOOLED` (migrations, Neon's direct string).
  `src/instrumentation.ts` makes the server refuse to serve without them.
  `.env.example` added.
- `GET /api/health` runs one query through the pool (ARCH-09).
- `docker-compose.yml`: local PostgreSQL on host port 5433. Vitest and
  Playwright always use it (or the CI service), never `.env.local`.
- CI: `unit` and `e2e` start PostgreSQL and run `pnpm db:migrate` first.
- Verified against Neon: `pnpm db:migrate` applied the empty first migration
  over the direct URL, and `/api/health` answered `ok` over the pooled URL.
  `.env.example` also lists `NESSIE_API_KEY` (server-side only, ADR-033).
- Auth stays as ADR-006 (Better Auth as a library, tables in our database).
  Neon's managed "Neon Auth" is not used: its Organization plugin is only
  partly supported and it does not exist in local or CI PostgreSQL.

### What's next
1. Each developer: copy `.env.example` to `.env.local`, paste both Neon
   connection strings, run `pnpm db:migrate`, then open `/api/health`.
2. Add `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the Vercel project.
3. Better Auth with the Drizzle adapter and organization plugin (F-01, F-02).

### Open problems
- `pnpm build` and `pnpm dev` now need `DATABASE_URL`; without it the build
  fails and the server answers 500 with a clear log line.
- The open problems in HO-016 still stand.

---

## HO-018: Better Auth on top of the Drizzle setup

- **Date:** 2026-10-10 13:40 (EDT)
- **Author:** Simon Ormond with Claude (Claude Code)
- **Branch / PR:** `feat/better-auth` / not opened

### What changed
- Better Auth 1.7 (ADR-006) in `src/lib/auth/auth.ts`, using the Drizzle
  client from HO-017: email and password, the organization plugin with roles
  `owner` / `editor` / `viewer` (ADR-007, `src/lib/auth/permissions.ts`),
  `nextCookies`, and rate limits stored in the database so they hold across
  serverless instances (ARCH-08). Handler at `/api/auth/[...all]`;
  `getSession()` in `src/lib/auth/session.ts`; browser client in
  `src/lib/auth/client.ts`.
- Auth tables (`user`, `session`, `account`, `verification`, `organization`,
  `member`, `invitation`, `rate_limit`) in `src/lib/db/schema/auth.ts` and
  migration `0001_better_auth`. They come from Better Auth's own Drizzle
  generator, with `timestamptz` columns. `src/lib/db/schema/auth.test.ts`
  fails if a Better Auth upgrade expects columns we don't have.
- `src/lib/env.ts` now also requires `BETTER_AUTH_SECRET` (32+ characters)
  and `BETTER_AUTH_URL`; both are in `.env.example`.
- Tests: Vitest for env, roles, the auth config, the session helper, the
  client and the schema; Playwright `auth-api.spec.ts` signs up, out and in
  through the API against the local PostgreSQL.

### What's next
1. Each developer: add `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` to
   `.env.local`, then run `pnpm db:migrate`. Add both to Vercel.
2. Create the Personal workspace on sign-up (ADR-007), for example in a
   Better Auth `databaseHooks.user.create.after` hook.
3. `requireWorkspaceAccess` in `src/lib/auth/authz.ts` (ARCH-04), using the
   roles in `permissions.ts`.
4. The `(auth)` sign-in and sign-up pages, with `auth.spec.ts` (TEST-07).

### Open problems
- Vercel preview URLs differ from `BETTER_AUTH_URL`, so Better Auth will
  reject their origin. Add `trustedOrigins` for previews when they are set up.
- The `auth` CLI package was not installed; regenerate the schema with Better
  Auth's Drizzle generator when upgrading (see the header of
  `src/lib/db/schema/auth.ts`).
- The open problems in HO-017 still stand.

---

## HO-019: Calendar mock scaffold on the home page

- **Date:** 2026-10-10 13:45 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `feat/calendar-mock-scaffold` (uncommitted) / not opened

### What changed
- The calendar design mockup is integrated as the starting scaffold, so each
  lane has real code to build on:
  - `src/features/cashflow/domain/`: month view, summary and per-day amount,
    subscription costs, date helpers, a rule-based text reader, sample data.
  - `src/features/cashflow/ui/`: dashboard, month grid, list, balance line,
    day panel, text thread.
  - `src/lib/money` (branded `Cents`) and `src/config/app.ts` (`APP_NAME`).
  - `src/app/globals.css`: the design tokens and all calendar styles as
    plain CSS. Tailwind is loaded without its base reset (ADR-046).
  - The home page renders the dashboard. The Nessie script tag is kept.
- Tests: Vitest for `lib/money` and the cashflow domain (TEST-04), and
  `tests/e2e/calendar.spec.ts` for the home page (TEST-07). Feature UI is
  left out of unit coverage and covered by Playwright (TEST-03).
- `PORT=3210 pnpm test:e2e` runs E2E on another port when `pnpm dev` holds
  3000.

### What's next
- **Lane A (data):** replace `domain/demo-data.ts` with a server-built
  `CashflowData` from the database (ARCH-06). The shape `CashflowData` is
  the contract between the data lane and the calendar.
- **Lane B (web):** the page is all client state today. Move data loading to
  the server, add the workspace route (`/w/[workspaceId]`), split
  `globals.css` into tokens plus CSS Modules (ADR-046).
- **Lane C (agent):** `domain/read-text.ts` and the text thread are a
  stand-in for the real agent brain (ADR-032, ADR-035).

### Open problems
- ADR-029 says no mockup code is copied into this repository. This change
  does that, so ADR-029 no longer matches the code and needs a superseding
  ADR from the team.
- `lib/money` is smaller than ADR-008 and TEST-04 require: no half-to-even
  rounding, no cent-preserving split, no "(12.00)" or negative parsing, no
  `fromDollarNumber`, no fast-check property tests.
- Subscriptions and paydays come from fixed sample rules, not detection
  (ADR-014). No axe, reduced-motion or responsive Playwright suites yet.
- The page says "Design preview with made-up numbers" and the title says
  "design preview"; change both when real data is wired in.
- The open problems in HO-018 still stand.

---

## HO-020: Landing page, sign-up, sign-in; dashboard moved to /dashboard

- **Date:** 2026-10-10 14:10 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `feat/calendar-mock-scaffold` / same PR as HO-019

### What changed
- Routes: `/` is a landing page; `/sign-up` and `/sign-in` (in
  `src/app/(auth)/`) use the Better Auth client from HO-018; the calendar
  moved from `/` to `/dashboard`.
- `/dashboard` needs a session: a signed-out visitor is redirected to
  `/sign-in`. The session is read inside a Suspense boundary (Cache
  Components). A "Signed in as … / Sign out" bar sits above the calendar.
- `src/features/auth/`: `domain/credentials.ts` validates form input with
  zod and turns Better Auth errors into plain messages; `ui/` has the form
  and the sign-out button. No change to `src/lib/auth` or the auth tables.
- All new pages use CSS Modules with the tokens in `globals.css` (ADR-046).
- Fix: the Tailwind loader rule in `next.config.ts` was turning every
  `*.module.css` into global CSS, so CSS Modules had no class names. The
  rule now skips them.
- Tests: Vitest for `credentials.ts`; Playwright `auth.spec.ts` (TEST-07)
  for sign up, sign out, wrong password and sign in through the pages.
  `auth.setup.ts` signs one shared user up for specs of signed-in pages
  (`tests/e2e/support.ts`).

### What's next
- Create the Personal workspace on sign-up and move the calendar under
  `/w/[workspaceId]` (ADR-007, AGENTS.md section 6). `/dashboard` is a
  stand-in until then.
- Send a signed-in visitor from `/sign-in` and `/sign-up` to the dashboard.

### Open problems
- Sign-in will not work on Vercel preview URLs until `trustedOrigins` is
  set (HO-018), so the dashboard cannot be opened on a preview.
- Better Auth limits sign-in to a few tries per 10 seconds per IP. Running
  the E2E suite twice in quick succession locally can fail
  `auth-api.spec.ts` with 429; wait a few seconds and re-run.
- The open problems in HO-019 still stand.

---

## HO-021: Sign-up fills in the email passed from the landing page

- **Date:** 2026-10-10 15:20 (EDT)
- **Author:** Simon Ormond with Claude
- **Branch / PR:** `feat/landing-page` / not opened

### What changed
- `/sign-up?email=…` now starts the Email field with that address, so the
  new landing page's email box doesn't make people type it twice.
- `prefillEmail` in `src/features/auth/domain/credentials.ts` validates it
  with the same zod email rule as the form (max 254 characters). Anything
  else, including a repeated `?email=`, is ignored. The person can still edit
  the field; only the email is ever prefilled, never the password.
- `src/app/(auth)/sign-up/page.tsx` reads `searchParams` inside `<Suspense>`,
  as Cache Components requires: the empty form is the static shell and the
  filled-in form streams in. The build lists `/sign-up` as Partial Prerender.
- Tests: Vitest cases for `prefillEmail`; Playwright "sign-up fills in an
  email passed from the landing page" in `auth.spec.ts`.

### What's next
- Point the landing page's email form at `/sign-up` (method GET, field
  `email`) when it moves into the app.

### Open problems
- Checked with typecheck, lint, format, the credentials unit tests, a
  production build, and the new Playwright test against that build. The full
  unit and E2E suites were not run: no local PostgreSQL in that environment.

---

## HO-022: Landing page rebuilt from the design canvas

- **Date:** 2026-10-10 16:10 (EDT)
- **Author:** Simon Ormond with Claude
- **Branch / PR:** `feat/landing-page` / not opened

### What changed
- `/` is now the "Reeflect Landing Page" design from the claude.ai canvas,
  built as `src/features/landing`. `src/app/page.tsx` only renders
  `LandingPage`, and the old `page.module.css` is gone.
- Sections: dark hero with the per-day headline and balance line, three
  features (Today card, statement import, text conversation), the
  Nessie-to-calendar pipeline, three steps, and an email sign-up box that
  sends `/sign-up?email=…` (HO-021's next step, done).
- The demos loop on one shared clock (`ui/demo-clock.tsx`). Their sample
  figures are integer cents in `domain/demo.ts`, formatted and tweened
  through `src/lib/money`. With `prefers-reduced-motion` the clock never
  starts and every demo is shown in full.
- The mockup's month switch and remove buttons are not real buttons on the
  landing page; they do nothing there, so they are decorative and hidden
  from screen readers. The chat is a captioned list, not a live log, so it
  isn't announced on every loop.
- Colours are new `--landing-*` tokens in `globals.css` (ADR-046). The page
  keeps one look in both themes, so they have no dark-mode values. Fonts are
  Geist and Geist Mono through `next/font`, scoped to the landing page.
- Tests: Vitest `src/features/landing/domain/demo.test.ts`; Playwright
  `tests/e2e/landing.spec.ts` (email hand-off, section links, reduced motion,
  screen-reader labels, 360px width). The home-page test in `auth.spec.ts`
  follows the new copy.
- Fixed a race in HO-021's Playwright test: while the filled-in sign-up
  form streams in, a hidden copy of the Email field exists, so the test now
  uses `getByRole("textbox", { name: "Email" })`, which skips hidden fields.

### What's next
- Point the "Sign in" and "Sign up" links at the dashboard for visitors who
  are already signed in, if we want that.

### Open problems
- The Nessie sync and statement import shown on the page are labelled
  "Preview"; drop the labels when they ship.
- `pnpm exec playwright install chromium` was needed locally after the
  Playwright update.

---

## HO-023: Signed-in header with a navbar; a placeholder page per feature

- **Date:** 2026-10-10 15:40 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `feat/app-nav` (uncommitted) / not opened

### What changed
- `src/app/(app)/layout.tsx` is the header for every signed-in page:
  wordmark, a navbar, "Signed in as … / Sign out". It also sends signed-out
  visitors to `/sign-in`, so pages in the group need no check of their own
  until they load data (then ARCH-04 applies).
- The navbar reads `src/config/nav.ts`. Nine links: Dashboard, Accounts,
  Transactions, Import, Subscriptions, Bills, Budgets, Insights, Settings.
- Each link has a page in `src/app/(app)/<name>/page.tsx`. All but the
  dashboard render `PagePlaceholder` (`src/components/ui/`) with the feature
  ids the page is for.
- The dashboard moved to `src/app/(app)/dashboard/` (URL unchanged). Its own
  wordmark was removed, since the shared header shows it.
- `getSession` is wrapped in React `cache()`, so the header and the sign-in
  check share one lookup per request.
- Tests: `src/config/nav.test.ts` (every link has a page) and
  `tests/e2e/app-nav.spec.ts` (links, current-page mark, signed-out
  redirects).

### What's next
- **To build your feature:** open your page in `src/app/(app)/<name>/`,
  replace `<PagePlaceholder … />` with your component from
  `src/features/<feature>/ui/`, and style it with a CSS Module using the
  tokens in `globals.css` (ADR-046). The link is already in the navbar.
- **To add a page that is not listed:** create its folder in
  `src/app/(app)/` and add one line to `src/config/nav.ts`. Update the list
  in `tests/e2e/app-nav.spec.ts` too.
- When a page gets a real `<h1>` that differs from its nav label, update its
  row in `app-nav.spec.ts`.
- Design cleanup of the header and pages happens after everyone's frontend
  work is in.

### Open problems
- URLs are flat (`/accounts`), not under `/w/[workspaceId]` (ADR-007);
  the group moves when workspaces exist.
- The open problems in HO-022 still stand.

---

## HO-024: Signed-in header stays on screen and is larger

- **Date:** 2026-10-10 16:10 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `feat/app-nav` (uncommitted) / not opened

### What changed
- The header in `src/app/(app)/layout.tsx` is `position: sticky`, so it
  stays at the top while a page scrolls. It is still rendered on the server
  as part of the layout; no script is involved.
- The wordmark and links are larger, with more padding.
- When space runs short the email address shortens, then disappears, before
  any link is cut off; after that the links scroll sideways.
- `html` has `scroll-padding-top`, so an element that receives keyboard
  focus is not hidden under the header.

### What's next
- Give pages enough top spacing of their own; the header takes 75 to 115
  pixels of every signed-in screen.

### Open problems
- Below about 1100 pixels wide, the last links are reached by scrolling the
  link row sideways. A menu for small screens is left for the design cleanup.
- The open problems in HO-023 still stand.

---

## HO-025: Better Auth Infrastructure dashboard connected

- **Date:** 2026-10-10 17:30 (EDT)
- **Author:** Simon Ormond with Claude
- **Branch / PR:** `feat/better-auth-additions` / not opened

### What changed
- New ADR-047 (Proposed): the app reports auth activity to Better Auth's
  hosted dashboard through `@better-auth/infra`.
- `src/lib/auth/auth.ts` adds `dash()` only when `BETTER_AUTH_API_KEY` is
  set; `nextCookies()` stays last. `src/lib/auth/client.ts` adds
  `dashClient()`. Activity tracking is off, so there is no migration.
- `BETTER_AUTH_API_KEY` is optional in `src/lib/env.ts` (empty counts as
  unset), listed in `.env.example` and ARCHITECTURE ARCH-09.
- `playwright.config.ts` sets the key to empty for the test server, so test
  sign-ups never reach the dashboard.
- Tests: env parsing of the key; the plugin is present with a key and absent
  without one.

### What's next
- Add `BETTER_AUTH_API_KEY` to Vercel (Production) and redeploy, then sign
  in once and check the event shows on the dashboard.
- Team to confirm ADR-047.

### Open problems
- Real users' emails and sign-in details go to a third party; see ADR-047.

---

## HO-026: Synthetic batch generator, batch-testing branch, Nessie probe

- **Date:** 2026-10-10 16:50 (EDT)
- **Author:** Jacob Heminway with Claude (Claude Code)
- **Branch / PR:** `database/migration` (uncommitted) / not opened

### What changed
- **ADR-048 (Proposed): Nessie as it behaves today**, from a live probe.
  - Nessie starts empty; it does not generate demo data.
  - Back-dated dates are kept.
  - Cents are dropped except on bills.
  - Balances never move.
  - A purchase without `status` breaks that account's purchase list.
  - Transfers have no payee.
  - Customers cannot be deleted.
- **ADR-049 (Accepted): synthetic data batches.**
  - An agent writes a population spec following the new
    [docs/SYNTHETIC.md](SYNTHETIC.md).
  - Seeded code in `src/features/synthetic` expands it.
  - Batches are tried on the Neon batch-testing branch, then promoted to
    production by replay.
- **Migration `0002_synthetic_batches`** adds four tables:
  - `financial_account` and `transaction`, the ARCH-03 tables for F-03 and
    F-04, without `category_id` and `import_batch_id` for now.
  - `synthetic_batch`.
  - `synthetic_workspace`: the marker. A workspace is Better Auth's
    `organization`, so the marker is our own table, not a column on theirs.

  Our tables get UUID v7 ids (`src/lib/db/id.ts`).
- **New commands:** `pnpm db:whoami`, `pnpm db:migrate:to` and `pnpm batch`
  (load, list, report, delete, promote).
  - `scripts/register-paths.ts` lets plain `node` scripts import `@/…` code.
  - Production writes need `--target production`, `--yes`, and a matching
    `NEON_PRODUCTION_ENDPOINT_ID`.
- **`truncateToDollars` in `src/lib/money`**, for Nessie-bound amounts.
- **Docs:**
  - ARCH-02, ARCH-03, ARCH-08, ARCH-09, ARCH-10 (which database and which
    migrations a build uses) and ARCH-14 updated.
  - TEST-03, TEST-04, TEST-05 and TEST-08 updated.
  - AGENTS.md (commands, Nessie rules, docs table), the PROJECT.md glossary
    and F-21, and `.env.example` updated.
- **Batch-testing branch** (`ep-fancy-base-b44dev77`): migrated to 0002
  (see the first open problem). It holds the first batch, `01a1279d-…`
  "First 50, North Carolina, Jul-Oct 2026", loaded with seed `nc-first-50`:
  - 50 people in the default mix, July 1 to October 10, 2026.
  - 117 accounts and 6,627 transactions.
  - No plausibility flags.
  - `batch report` confirms the database matches the recipe.
  - Its spec is `scripts/batch/specs/first-50-nc.json`.
- **Tests:**
  - Vitest for the generator (calendar, random, spec, expand, check), the
    database targets, migration comparison, row building, reports and
    `uuidv7`.
  - `scripts/batch/store.test.ts` (load atomicity, cascade delete) needs the
    Docker database, so it runs in CI; there is no Docker on this laptop.

### What's next
1. Add `NEON_PRODUCTION_ENDPOINT_ID=ep-autumn-block-b4n38d0q` to `.env.local`.
2. With the team's OK, record `0001_better_auth` as applied on production
   (first open problem), then `pnpm db:migrate:to production`.
3. Review the first batch on the branch, then
   `pnpm batch promote 01a1279d-200f-7bbd-93ee-2d5a0501553e --target production --yes`
   once production is migrated.
4. A way to view a synthetic workspace in the app (they have no members),
   then the Nessie client and `pnpm db:seed` (F-21, ADR-048).
5. Playwright coverage arrives with the first page that shows synthetic data.

### Open problems
- **Production's migration record is out of step.**
  - **What happened:** Neon production recorded an earlier draft of
    `0001_better_auth` (hash `a9734c03…`, timestamp `1791652529617`).
    Someone regenerated the file after applying it.
  - **Why it matters:** the tables match the committed migration column for
    column, but `pnpm db:migrate` would try to run `0001` again and fail on
    `CREATE TABLE "user"`.
  - **Fix:** insert one row into `drizzle.__drizzle_migrations` with the
    committed file's sha256 and timestamp `1791653688740`.
  - **Status:** done on the batch-testing branch (where 0002 then applied
    cleanly); not done on production.
- **A hard-coded Nessie API key is public.**
  - **Where:** `public/lib/example.html` and `public/lib/unit_tests.html`
    (commit 6525b1b).
  - **Exposure:** the GitHub repository is public, and every deployment
    serves those files at `/lib/…`.
  - **Whose key:** it does not match the team key in `.env.local`; it is
    probably the sample key from Capital One's SDK repository. Simon should
    confirm whose it is.
  - **Proposed fix:** delete those two files (and `public/lib/tests/`).
    HO-016 says not to remove the SDK without asking, so they are untouched.
  - **Also:** `pnpm scan:bundle` does not scan `public/`.
- **The browser SDK targets the old API shape** (no `status`, old transfer
  fields), and using it means putting a key in the browser (ADR-033,
  ADR-048).
- **Leftovers on the team Nessie key** from the probe: one customer and one
  merchant, named "Synthetic … probe". They cannot be deleted.
- **Rounding drift in money code.** ADR-008 and TEST-04 say round half to
  even, but `fraction` in `src/lib/money` uses `Math.round` (half up). Not
  changed here.

---

## HO-027: Personal workspace on sign-up; pages under /w/[workspaceId]

- **Date:** 2026-10-10 17:35 (EDT)
- **Author:** Simon Ormond with Claude (Claude Code)
- **Branch / PR:** `feat/personal-workspace` (uncommitted) / not opened

### What changed
- **Personal workspace (ADR-007).** `src/lib/auth/personal-workspace.ts`
  creates one `organization` named "Personal" (slug `personal-<userId>`,
  metadata `{"kind":"personal"}`) with the user as its only `owner` member.
  - It runs from Better Auth's `databaseHooks.user.create.after`, which
    fires after the user row is committed. A failure is logged by user id
    and does not fail the sign-up.
  - It is idempotent and safe to run twice at once. Users who signed up
    before this get their workspace on their first visit.
- **`requireWorkspaceAccess` (ARCH-04)** in `src/lib/auth/authz.ts`.
  - It validates the id with zod and loads the membership.
  - It calls `notFound()` for no session, a malformed id, a non-member or a
    role that is too low.
  - It returns `{ workspaceId, role }`. Role order (viewer < editor < owner)
    is in `src/lib/auth/roles.ts`.
  - Synthetic workspaces have no members, so it hides them.
- **Pages moved to `src/app/(app)/w/[workspaceId]/<name>/`.**
  - Its `layout.tsx` sends signed-out visitors to sign-in and checks
    membership.
  - The old flat URLs (`/dashboard`, `/accounts`, …) are now redirects into
    the user's Personal workspace (`personalWorkspaceHref` in
    `src/lib/auth/home.ts`), so sign-in still lands on `/dashboard`.
- **Nav.** `src/config/nav.ts` lists segments, and `AppNav` links inside
  the workspace in the URL. It reads the URL, so it sits in Suspense with
  `AppNavFallback`, which shows the same links pointing at the redirects.
- The workspace code lives in `src/lib/auth/`, not in `src/features/`,
  because `auth.ts` needs it and `lib/` must not import from features.
- **Tests:**
  - Vitest for roles, authz and the Personal workspace (against the Docker
    database), the href helper and the sign-up hook.
  - New `tests/e2e/workspaces.spec.ts`: a new user lands in their
    workspace, flat URLs redirect into it, another user's workspace is not
    found, signed out goes to sign in.
  - `app-nav`, `auth` and `nav.test` updated for the new URLs.

### What's next
- **To build your feature page:** it is now in
  `src/app/(app)/w/[workspaceId]/<name>/page.tsx` (not the folder in
  HO-023). Read `workspaceId` from `params` and call
  `requireWorkspaceAccess` again in your server code before loading data.
- **To add a page:** create both
  `src/app/(app)/w/[workspaceId]/<name>/page.tsx` and the flat redirect
  `src/app/(app)/<name>/page.tsx`, then add the segment to `nav.ts`.
- **Production:** existing users get their workspace the first time they
  open any app page. No migration is needed.
- **Household workspaces** (create, invite link, switcher) remain for later
  (PROJECT.md F-02).
- **TEST-06:** the workspace isolation matrix still needs a registry of
  entry points; it should start with the first server action that loads
  data (F-03).

### Open problems
- A non-member gets Next's default "This page could not be found." page,
  with HTTP status 200, because the page has already started streaming.
  It shows no data. A styled `not-found.tsx` is left for the design
  cleanup.
- On this machine the local Docker database had not been migrated to
  `0002`. `pnpm db:migrate:to local` fixed it.

---

## HO-028: Agent docs fact-checked against the code

- **Date:** 2026-10-10 17:30 (EDT)
- **Author:** Jacob Heminway with Claude (Claude Code)
- **Branch / PR:** `feat/insights` / PR into `main`

### What changed
- **Merged with HO-027.** Both entries were written as HO-027 at the same
  time; this one is renumbered HO-028. Where this entry says the URLs are
  flat or `authz.ts` is not written, HO-027 made that untrue: the merge
  updated AGENTS.md sections 4 and 6 and ARCH-04 to match.
- **Corrects earlier entries:**
  - HO-018 to HO-025 say "uncommitted" or "not opened". Their work is on
    `main`: PR #1 (Better Auth), #2 (calendar scaffold, sign-in and
    sign-up), #3 (landing page), #4 (app nav), #5 (Better Auth
    Infrastructure).
  - HO-026's work merged as PR #7. PR #6 added the
    `vercel-react-best-practices` agent skill.
- **AGENTS.md:**
  - Section 6 shows the tree as it is and marks what is planned.
    - The signed-in pages are flat (`/dashboard`, …) in `src/app/(app)/`,
      not under `/w/[workspaceId]` yet.
    - `lib/security`, `lib/ai`, `agent-worker/` and `packages/` don't
      exist yet.
  - Things that don't exist yet are now marked:
    - `src/lib/auth/authz.ts` (`requireWorkspaceAccess`).
    - `fromDollarNumber`.
    - The workspace packages.
    - The missing parts of `lib/money`.
  - The Gemini prize track is listed (ADR-036).
- **ARCHITECTURE.md:**
  - ARCH-02 lists the features built so far.
  - ARCH-03 says `workspace_settings` was never built.
  - ARCH-04 explains the flat URLs.
- **TESTING.md:**
  - TEST-01 notes fast-check and axe are not installed.
  - TEST-03 lists every coverage exclusion that `vitest.config.mts` has.
- **Other files:**
  - `README.md` was create-next-app boilerplate (npm, yarn, bun,
    `app/page.tsx`). It now points to AGENTS.md and gives the pnpm setup.
  - `.env.example`'s header no longer claims `env.ts` validates every
    variable.
  - A stale file name in a `playwright.config.ts` comment is fixed.

### What's next
- Team: decide the open problems below that need a decision.

### Open problems
- **Accepted ADRs whose consequences no longer match the code.** These need
  a superseding ADR from the team, not an edit:
  - ADR-029 says no mockup code is copied in (see HO-019).
  - ADR-046 says the create-next-app starter page still uses Tailwind; it is
    gone.
  - ADR-021 says lefthook guards `main`; it was never installed.
- **Agent skills are in three folders that have drifted.**
  - `.claude/skills/` (Claude Code), `.agents/skills/` and `skills/` hold
    copies.
  - `neon` and `neon-postgres` are only in `.agents/skills/`, so Claude Code
    doesn't see them.
  - Muhammad added these; decide on one source and how the others are
    filled.
- **`lib/money` is behind ADR-008 and TEST-04:**
  - No split without losing cents.
  - No "(12.00)" or negative parsing.
  - No `fromDollarNumber`.
  - `fraction` rounds half up, not half to even.
- **Branch names:** `database/migration` and `consolidate-docs` don't
  follow AGENTS.md's `<type>/<description>` rule.
- **Still open from HO-026:**
  - Production's migration record.
  - The public Nessie key in `public/lib`; the root layout still loads that
    SDK.

---

## HO-029: Clutter removed: duplicate skills, Nessie browser SDK, template images

- **Date:** 2026-10-10 18:00 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `chore/remove-clutter` (uncommitted) / not opened

### What changed
- **Root `skills/` deleted.** It was a byte-for-byte copy of
  `.claude/skills/`, and nothing referenced it. `.claude/skills/` (Claude)
  and `.agents/skills/` (Codex, Gemini) stay, with `skills-lock.json`.
- **`.claude/skills/` gains `neon` and `neon-postgres`**, copied from
  `.agents/skills/`, so both folders hold the same skills.
- **`public/lib/` and `NESSIEREADME.md` deleted** (Capital One's browser
  SDK; HO-016 said to ask first, and Muhammad approved).
  - The root layout loaded it on every page through a `<Script>` tag with
    `strategy="beforeInteractive"`; that tag is removed from
    `src/app/layout.tsx`. No code used the SDK.
  - Its ignore lines are gone from `eslint.config.mjs` and
    `.prettierignore`.
  - ARCH-08, ARCH-14 and ADR-048 now say it was removed.
- **Five create-next-app images deleted** from `public/` (`next`, `vercel`,
  `globe`, `window`, `file`). `public/` is now empty, so the folder no
  longer exists; create it again when the first real asset arrives.

### What's next
- The iMessage agent, one feature per plan, starting with F-24 phone
  linking on `feat/photon-agent`.

### Open problems
- **The hard-coded Nessie key is still in git history** (commit 6525b1b) of
  a public repository. Deleting the files only stops deployments serving
  it. Whoever owns that key should treat it as public (HO-026).
- Jacob's PR #9 also edited `ARCHITECTURE.md` and this file. It merged
  first, so this entry was renumbered from HO-028 to HO-029.

---

## HO-030: Financial accounts (F-03); first server actions and the isolation matrix

- **Date:** 2026-10-10 18:40 (EDT)
- **Author:** Simon Ormond with Claude (Claude Code)
- **Branch / PR:** `feat/financial-accounts` (uncommitted) / not opened

### What changed
- **F-03 is built** on the `financial_account` table from migration 0002.
  There is no schema change.
  - `/w/[workspaceId]/accounts` lists accounts grouped by type, with exact
    balances. Cards and loans show "Owed $300.00"; checking and savings
    show "Balance …".
  - Add an account at `/accounts/new`; edit or delete one at
    `/accounts/[accountId]`.
  - Delete takes two steps, and the second says the account's transactions
    go with it (ADR-025).
  - Viewers see no add or edit links. Pages and actions require editor.
- **Balances.** The user types the current balance, or the amount owed for
  a card or loan. It is stored signed (owed is negative, ADR-008), with
  `balance_as_of` set to today in `DEFAULT_TIME_ZONE`
  (`src/config/app.ts`, America/New_York until users can set their own).
  - A synced account (`source` other than `manual`) keeps the type and
    balance its source gives it; only its name, institution and last 4
    can be edited.
  - New `parseBalance` in `src/lib/money` accepts 0 and a leading minus
    (overdrawn).
- **Server-action pattern** (`src/features/accounts/server/actions.ts`),
  for the next features to copy:
  1. The page binds the ids (`action.bind(null, workspaceId, id)`).
  2. The action calls `requireWorkspaceAccess(getSession(), workspaceId,
     "editor")`.
  3. It zod-parses the ids and form, then calls the repository with the
     verified id.
  4. It calls `redirect()` on success. On bad input it returns `{ errors,
     values }`; React resets forms after an action, so the typed values
     come back to refill them.
- **TEST-06 isolation matrix started.** `server/entry-points.ts` lists a
  feature's actions (`EntryPoint` in `src/lib/auth/entry-point.ts`), and
  `src/lib/auth/isolation.test.ts` runs every list.
  - It checks that a non-member finds nothing, that another workspace's
    object ids change nothing, that a role below the minimum is refused,
    and that a signed-out visitor is refused.
  - **Add your feature's list there.**
- `src/features/accounts/index.ts` exports `listAccounts`, `getAccount`,
  `AccountSummary` and `owesMoney` for F-04, F-12 and F-23.
- **Tests:**
  - Vitest for the domain, money, the repository and actions (against
    Docker) and the matrix.
  - Shared database fixtures in `tests/support/db-fixtures.ts`.
  - `tests/e2e/accounts.spec.ts` (TEST-07).
  - `auth-api.spec.ts` now uses `ownClientAddress()`. It used to share
    the default address's sign-in allowance with `auth.spec.ts` and
    failed with 429 about half the time when run in parallel.

### What's next
- **F-04 manual transactions** on top of `getAccount`, with the same
  action pattern and its own `entry-points.ts`.
- **F-12:** build the calendar's starting balance from `listAccounts`.
- **F-23:** Nessie sync creates accounts with `source: "nessie"` and
  `nessieAccountId`.

### Open problems
- Next 16 keeps the previous page in the DOM, hidden. Playwright locators
  must be by role (which skips hidden elements); `getByLabel` can match
  the hidden copy.
- No audit event is written on delete yet (ADR-025, P1).

## HO-031: Manual transactions (F-04); ADR-050 balance rule

- **Date:** 2026-10-10 19:26 (EDT)
- **Author:** Simon Ormond with Claude (Claude Code)
- **Branch / PR:** `feat/manual-transactions` (uncommitted) / not opened

### What changed
- **F-04 is built** on the `transaction` table from migration 0002. There
  is no schema change.
  - `/w/[workspaceId]/transactions` lists transactions newest first,
    grouped by day, with signed exact amounts ("Money out, −$12.50" for
    screen readers) and "Pending" / "Transfer" labels. A GET form narrows
    it to one account (`?account=`). At most 200 rows (`LIST_LIMIT`).
  - Add at `/transactions/new` (account, date, money out or in, amount,
    description, pending, transfer). Edit or delete at
    `/transactions/[transactionId]`; delete takes two steps.
  - With no accounts, the page asks for one first.
  - Same server-action pattern as HO-030; viewers see no add or edit links.
- **ADR-050 (Proposed): the balance rule.** A manual transaction dated on
  or after the account's `balance_as_of` moves a manual account's balance;
  earlier ones are already in the typed balance. Edits and deletes take the
  effect back, in one database transaction with the account rows locked.
  Typed rows get fingerprint `manual:<id>`. Imported or synced rows can
  change only description and transfer mark. **The team should confirm
  ADR-050.**
- **TEST-06:** `EntryPointTarget` now has `transactionId`;
  `TRANSACTION_ENTRY_POINTS` is in the matrix, and the B snapshot includes
  transactions.
- `src/features/accounts/index.ts` also exports `isoDateIn`.
- `src/features/transactions/index.ts` exports `listTransactions`,
  `getTransaction` and `TransactionSummary` for F-12 and F-27.
- **Tests:** Vitest for the domain (parsing, balance rule, grouping), the
  repository and actions (against Docker) and the matrix;
  `tests/e2e/transactions.spec.ts`. Full `pnpm test:unit` (505) and
  `pnpm test:e2e` (47) pass.

### What's next
- **F-12:** build the calendar from `listAccounts` and `listTransactions`
  instead of `demo-data.ts`.
- **F-08:** add `category_id` and a category field to the form.
- **F-27** reuses `createTransaction` with `source: "text"` once the agent
  exists (it currently always writes `manual`).

### Open problems
- ADR-050 is Proposed, not Accepted.
- The list has no paging past 200 rows.
- No audit event on delete yet (ADR-025, P1).

---

---

## HO-032: F-24 phone linking: link card, turn endpoint, ADR-051

- **Date:** 2026-10-10 19:10 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `feat/photon-agent` (uncommitted) / not opened

### What changed
- **ADR-051 (Proposed)** refines ADR-034: six-digit codes, approval on the
  website before anything is linked, lockout after 5 wrong codes, and the
  number to text as an optional setting.
- **Migration `0003_phone_linking`** adds `messaging_identity`,
  `agent_link_code` and `agent_link_attempt` (ARCH-03).
- **`POST /api/agent/turn`** (`src/app/api/agent/turn/route.ts`). It answers
  404 without `Authorization: Bearer <AGENT_SERVICE_TOKEN>`, and always when
  the token is not set. Body and reply are the zod schemas in
  `src/features/agent/domain/protocol.ts`.
- **`runAgentTurn`** handles LINK and STOP in code. An unlinked phone gets
  the sign-up reply only. A linked phone gets a fixed "answers are coming"
  line until F-25. No Gemini and no Photon code yet.
- **Settings card** (`src/features/messaging/ui/`) on
  `/w/<workspaceId>/settings`, in the user's Personal workspace only:
  Connect iMessage, the code, Approve / Not me, the opt-in checkbox,
  Disconnect. It polls every 3 seconds while a code is out.
- **Linking logic** is `src/features/messaging/server/link.ts`; the card's
  server actions (`actions.ts`) reuse Simon's `requireWorkspaceAccess` and
  `ensurePersonalWorkspace`.
- **Env:** `AGENT_SERVICE_TOKEN` and `AGENT_PHONE_NUMBER`, both optional, in
  `src/lib/env.ts`, `.env.example` and ARCH-09.
- **Tests:** Vitest for the code, handle, command parser, protocol, token
  check, linking (against the Docker database), server actions and the
  route; `tests/e2e/agent-link.spec.ts` for the flow in the browser.
- **Isolation matrix (TEST-06):** the five link actions are registered in
  `src/features/messaging/server/entry-points.ts` and run by
  `src/lib/auth/isolation.test.ts`.

### What's next
- **Before using the card on a shared database:** apply `0003`. It is on the
  local Docker database only. Production's migration record is still out of
  step (HO-026), so fix that first.
- **To try it by hand:** set `AGENT_SERVICE_TOKEN` in `.env.local`, press
  Connect iMessage, then post the turn yourself to `/api/agent/turn` with
  the header `Authorization: Bearer <token>` and a JSON body of `platform`
  (`imessage`), `handle`, `spaceId`, `messageId` and `text` (`LINK 482193`).
- **F-32, the worker,** is the next plan: `agent-worker/`, Photon Spectrum,
  and moving the protocol schemas to `packages/agent-protocol/`. Decide
  there how much of Photon's scaffold to keep, how a user on Photon's shared
  number pool finds the number to text, and whether `spectrum-ts` still has
  a Telegram provider (ADR-031's fallback).
- F-33 adds quiet hours to the same card; F-26 adds `alert_prefs`.

### Open problems
- **Playwright reuses whatever is on port 3000.** With `pnpm dev` running
  against Neon, every spec that touches the new tables fails. Stop the dev
  server, or run `PORT=3100 pnpm test:e2e`.
- **`src/lib/auth/auth.test.ts` times out now and then** (its first test
  imports Better Auth cold, with a 5-second limit). It failed in two of
  five full runs here, once before this work began.
- A phone unlinked by STOP still shows as connected on an open Settings
  page until that page is reloaded; the linked card does not poll.
- The linked reply says the agent cannot answer yet. Do not show the agent
  to users before F-25.

---

## HO-033: Signed-in pages no longer block a click (Next.js instant navigation)

- **Date:** 2026-10-10 20:10 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `feat/photon-agent` (uncommitted) / not opened

### What changed
- `next dev` reported "uncached data during a navigation" on most signed-in
  pages. A click from one page to another waited on the server before
  showing anything, because the page read the URL or the session with no
  Suspense boundary of its own. A boundary in a layout that is already on
  screen does not count: only what is below it is rendered again.
- **`PageLoading`** (`src/components/ui/page-loading.tsx`) is the shared
  fallback.
- **Workspace layout:** the membership check moved into a `Member`
  component inside a Suspense boundary. The check itself is unchanged.
- **Accounts pages (list, new, edit) and Settings:** the page is now a
  plain function that renders its old async body inside
  `<Suspense fallback={<PageLoading />}>`.
- **The nine workspace-free URLs** (`/dashboard`, `/accounts`, …) render
  `PersonalWorkspaceRedirect` (`src/components/ui/`), which does the same.
- `<body>` has `suppressHydrationWarning`, for attributes that browser
  extensions add to it.
- Checked by clicking through every signed-in page in a browser against
  `next dev`: no findings. `loading.tsx` and `template.tsx` files were tried
  first and did not clear them.

### What's next
- **When you build a page** under `src/app/(app)/w/[workspaceId]/`: do not
  `await params`, the session or data at the top of the page. Put that work
  in an async component and render it inside
  `<Suspense fallback={<PageLoading />}>`, as
  `src/app/(app)/w/[workspaceId]/accounts/page.tsx` does.

### Open problems
- Hydration warnings that name `bis_skin_checked` on every `div` come from a
  browser extension and cannot be fixed in code. Turn the extension off for
  `localhost`, or develop in a profile without it.
- No automated test guards this. Next's `@next/playwright` `instant()`
  helper could, at the cost of a new dev dependency.

---

## HO-034: Email verification and password reset through Resend (ADR-052)

- **Date:** 2026-10-10 20:30 (EDT)
- **Author:** Simon Ormond with Claude (Claude Code)
- **Branch / PR:** `feat/email-verification-resend` / not opened

### What changed
- **ADR-052 (Proposed):** Resend for email; new users must confirm their
  email before they can sign in. **The team should confirm it.**
- **Migration `0004_verify_existing_users`** (renumbered from 0003 after
  merging main, whose `0003_phone_linking` came first) (custom SQL, no schema change)
  marks every user present when it runs as verified.
- **`src/lib/email/`:** templates (greeting and link only; names are
  HTML-escaped), `deliver` (Resend, or `.email-outbox/` JSON files without
  a key; logs user id and message id only, never throws) and
  `sendAfterResponse` (Next's `after()`, so response time doesn't reveal
  whether an address has an account).
- **Env:** `RESEND_API_KEY`, `EMAIL_FROM`; both required when `VERCEL` is
  set, optional elsewhere; a key without `EMAIL_FROM` is refused.
  Playwright sets both empty.
- **Better Auth:** `requireEmailVerification`, `sendOnSignUp`,
  `sendOnSignIn`, `autoSignInAfterVerification`, one-hour links,
  `sendResetPassword`, `revokeSessionsOnPasswordReset`.
- **UI:** sign-up ends on "Check your inbox" (with "Send the link again");
  sign-in explains an unverified account and links to "Forgot your
  password?"; new pages `/forgot-password`, `/reset-password`,
  `/email-verified` (redirects to the calendar, or explains a bad link).
  `Field` moved to `src/features/auth/ui/field.tsx`.
- **Tests:** Vitest for templates, sender, env, auth config, the migration
  and the new form parsing. E2E: every API sign-up goes through
  `signUpVerified` in `tests/e2e/support.ts`, which follows the link from
  the outbox; new specs for unverified sign-in, resend, reset, unknown
  address and bad links. `pnpm test:unit` (535) and `pnpm test:e2e` (54)
  pass.

### What's next
- **Deploy order:** set `RESEND_API_KEY` and `EMAIL_FROM` on Vercel
  (Production and Preview), merge, run `pnpm db:migrate:to production`,
  **then** deploy. Deploying first would lock out existing users until the
  migration runs.
- Send one real email from a preview deployment to check Resend's DNS and
  the sender name.

### Open problems
- ADR-052 is Proposed, not Accepted.
- `.email-outbox/` is never cleaned up; delete it by hand when it grows.
- Signing up with an address that already has an account shows "Check your
  inbox" and sends nothing (Better Auth's enumeration protection). An
  "already have an account" email would need `onExistingUserSignUp`.

---

## HO-035: Isolated categorization engine (F-08, ADR-013)

- **Date:** 2026-10-10 19:18 (EDT)
- **Author:** Codex
- **Branch / PR:** `feat/transaction-categorization` (uncommitted) / not opened

### What changed
- Fetched main and created `/workspace/Reeflect-categorization` from `02c5154`.
  A final fetch confirmed that main still matches this base. The original
  checkout's planning changes were preserved.
- Added `src/features/categorization/`: pure merchant normalization, literal
  keyword matching, highest-priority selection with deterministic ties, manual
  override precedence and Zod validation. Unknown merchants return an
  uncategorized result; invalid inputs return validation issues. No I/O or
  transaction mutation. Public exports and integration examples are in the
  feature's `index.ts` and README.
- Added [CATEGORIZATION_PLAN.md](CATEGORIZATION_PLAN.md) with the implemented
  milestone and remaining dependencies. Existing routes, schemas, migrations,
  auth, calendar logic, dependencies, lockfile and CI are unchanged.
- Verification on the local test database:
  - Baseline: 439 unit/integration tests passed before engine changes.
  - Final: 517 unit/integration tests passed, including 78 engine tests at
    100% line and branch coverage.
  - All 42 existing non-external Playwright tests passed against the production
    build: auth, workspaces, accounts, navigation, calendar, landing and health.
  - Lint, format check, strict typecheck, production build and bundle scan passed.
- Test setup: started the repository's PostgreSQL container and installed the
  Chromium revision required by the locked Playwright package. The initial
  browser attempt could not launch because that revision was missing; the
  complete rerun passed after installation.

### What's next
- Integrate through `@/features/categorization` once category/rule persistence
  and the manual transaction/import caller are available. Callers authorize the
  workspace, supply only its rules and validate category ownership before writes.
- Add Playwright coverage for manual override, saved rule and re-import behavior
  with that user-facing integration (TEST-02). The engine alone is not full F-08.

### Open problems
- The current transaction schema has no category column; category/rule tables
  and the manual transaction UI are still missing on this main revision.
- Merchant cleanup is conservative; unsupported statement metadata is retained
  rather than guessed. It does not replace institution-specific import parsing.

---

## HO-036: Categorization engine prepared for commit and PR

- **Date:** 2026-10-10 19:31 (EDT)
- **Author:** Codex
- **Branch / PR:** `feat/transaction-categorization` / not opened yet

### What changed
- The user explicitly requested committing the engine and opening a PR.
- Re-fetched main: the branch's base still matches `02c5154`; no main updates
  need merging. Reviewed the feature and documentation scope for the commit.
- Application code is unchanged since HO-035's successful verification.

### What's next
- Commit and publish this branch, then open the engine PR into main. The PR
  description will distinguish engine verification from the future persisted
  categorization flow. Its link will be attached to this chat.
- Review the PR and integrate category persistence and a caller in later work.

### Open problems
- The full F-08 persistence and user-facing integration dependencies in HO-035
  remain. This PR contains the isolated engine milestone.

---

## HO-037: Complete F-08 categorization and transaction integration

- **Date:** 2026-10-11 00:54 (UTC)
- **Author:** Codex
- **Branch / PR:** `feat/transaction-categorization` / [PR #12](https://github.com/TahubCS/Reeflect/pull/12)

### What changed
- Completed persisted, workspace-scoped categories and rules, manual overrides
  with optional rule saving, explicit manual Uncategorized, return to automatic,
  rule creation/editing/deletion and renaming eight presets. Saves and automatic
  recategorization are atomic; manual choices survive rule and transaction edits.
- Integrated main through `adc6312`: retained F-04 add/edit/delete, balances,
  account filtering, grouping by day, instant navigation and verified signup.
  Creation/editing computes category metadata inside the existing SQL transaction.
  Transactions now paginate at 50 rows and have a route-local retry boundary.
  A final fetch confirmed main still matches this integrated revision.
- Generated additive `0005_categorization`, after phone linking's 0003 and
  verification's 0004. Composite foreign keys reject foreign-workspace categories;
  the composite unique index precedes its dependent foreign key in the SQL.
  Only editors initialize categories; all five actions require editor access
  before validation/writes and are covered by the shared isolation matrix.
- Exact merchant matching now handles store numbers followed by US city/state.
  Public read/write integration APIs and the separate pure client entry point
  are documented. No categorization vendor, dependency or money-rule changes.
- Final verification: **825 unit/database tests** and **74 non-external browser
  tests**, including 12 new categorization flows, passed. Categorization domain
  and server line coverage is 100%; branch coverage is 98.27% and 97.5% respectively.
  All six migrations applied to an empty local database. Lint, format check,
  strict types, docs checks, production build, client-bundle scan and diff checks
  passed. Browser verification used a fresh production server on port 3101.
- Browser signup polling now tolerates a partially written local outbox file
  during parallel tests. Recovery coverage allows only React's expected #419
  report from the deliberately broken fixture; normal flows allow no page errors.
- [Desktop light](screenshots/categorization/desktop-light.png),
  [desktop dark](screenshots/categorization/desktop-dark.png),
  [phone light](screenshots/categorization/phone-light.png) and
  [phone dark](screenshots/categorization/phone-dark.png) previews use synthetic
  data. Verified at 1440px and 360px, including reduced motion and no overflow.
- Engine handoffs were renumbered HO-035/HO-036 while retaining main's entries.
  Updated the implementation plan, feature README, architecture, testing and demo.

### What's next
- Publish the full feature commit to the same PR, then use the required CI and
  teammate review before merging. The user explicitly requested the entire
  feature pushed to this PR and authorized follow-up commits.
- Apply pending migrations, including 0005, before deploying the application.
  Import/sync callers can use `applyCategoryRules` after committing rows and
  must preserve manual category metadata on re-imports.

### Open problems
- No known F-08 regression from final local checks. No production migration
  or deployment was performed; the existing shared-database migration record
  concern in HO-026 still needs reconciliation before deployment.

---

## HO-038: PDF statement import (F-06), with the CSV kept in Neon object storage

- **Date:** 2026-10-10 (EDT)
- **Author:** Simon Ormond with Claude (Claude Code)
- **Branch / PR:** `feat/pdf-statement-import` / not opened

### What changed
- **ADR-053 (Proposed):** each import keeps one canonical CSV of its rows in
  a private Neon bucket `statements`; the PDF is still never stored (only
  its SHA-256). ADR-025's status line now says it is refined by ADR-053.
  **The team should confirm it.**
- **Migration `0006_import_batch`** (after categorization's 0005): new `import_batch` table (ARCH-03 plus
  `statement_*`, `rows_parsed`, `checks`, `csv_object_key`, `csv_sha256`,
  `committed_at`) and `transaction.import_batch_id`.
- **`src/features/imports/`:**
  - text extraction with `unpdf`
  - line grouping, and the Capital One 360 template
    (`domain/templates/capital-one.ts`), built from Capital One's public
    sample eStatement. It picks the section for the account's last 4 digits.
  - canonical CSV writer and strict reader
  - ADR-010 fingerprints
  - checks: identity, account type, USD, reconciliation, running balance,
    stated totals, CSV round trip, duplicate file, duplicate rows, period
    overlap or gap, continuity with the last import
  - the preview → commit pipeline: commit re-downloads the CSV, compares
    its SHA-256, re-parses and reconciles it, and imports the stored rows
  - server actions and the `/import` page: upload, a blocked result with
    its checks, preview, first-import confirmation, commit, discard, and
    waiting previews
- **`src/lib/storage/`:** the statements bucket through Neon's Files SDK adapter,
  and keys `w/<ws>/a/<account>/<batch>.csv`. Deleting an account deletes
  its CSVs. Env vars: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `STATEMENTS_BUCKET`, all five or
  none. Without them import is switched off; they are **not** required on
  Vercel, so deploys don't break.
- **`neon.ts`** declares the bucket (`@neon/config`).
- **Storage is Neon everywhere (no emulator):** the app uses Neon's Files
  SDK adapter (`files-sdk@2.6.0`, pinned; `files-sdk/neon`). Our code never
  imports `@aws-sdk`, but the adapter needs four `@aws-sdk/*` packages
  installed. Tests and local development use a new **schema-only Neon
  branch `storage-tests`** (`br-polished-hall-b439q9bu`) with its own
  `statements` bucket. Credentials come from gitignored
  `.env.storage-tests`, and Vitest and Playwright read only the storage
  variables from it (`tests/support/storage-env.ts`). CI reads four
  repository secrets: `NEON_TEST_STORAGE_ACCESS_KEY_ID`,
  `NEON_TEST_STORAGE_SECRET_ACCESS_KEY`, `NEON_TEST_STORAGE_ENDPOINT`,
  `NEON_TEST_STORAGE_REGION`.
- `next.config.ts`: server action body limit 11 MB.
- `src/lib/money`: `parseStatementAmount`, `toDecimalString`,
  `parseDecimalString`.
- **Fixtures:** `tests/fixtures/pdf/`, synthetic PDFs drawn by
  `generate.ts` from `specs.ts`; regenerating gives identical bytes.
  `.gitignore` now ignores `tests/fixtures/**/private/`. The earlier rule
  missed `tests/fixtures/synthetic/private/`, where the sample statement is.
- **Isolation matrix:** `EntryPointTarget` gained `importBatchId`; the
  three import actions are in it.
- **Tests:** `pnpm test:unit` (779) and `pnpm test:e2e` (67, including the
  new `pdf-import.spec.ts`) pass. `pnpm lint`, `typecheck`, `format:check`,
  `docs:check` and `scan:bundle` pass. Storage tests ran against the Neon
  `storage-tests` bucket.

### What's next
- **Add the four CI secrets** (GitHub → Settings → Secrets and variables →
  Actions), with the values from `.env.storage-tests`; until then CI's
  storage tests fail. Teammates pull `.env.storage-tests` themselves with
  the command in AGENTS.md section 5.
- **Deploy:**
  1. `neon link`, then `neon deploy` to create the bucket.
  2. Set the five storage vars on Vercel (Production and Preview), with
     `STATEMENTS_BUCKET=statements`.
  3. Merge, then `pnpm db:migrate:to production`, then deploy.
- Upload one statement on a preview deployment to check Neon storage end
  to end.
- Add a statement upload step to the demo script in `docs/PITCH.md`.
- F-05 CSV import can reuse the pipeline after parsing: `rows`, checks,
  CSV and commit.
- Gemini reading the stored CSVs is a later feature: only synthetic or
  sandbox statements while the key is on the free tier (ADR-019, ADR-040).

### Open problems
- ADR-053 is Proposed, not Accepted.
- Only Capital One 360 deposit statements. Card statements have another
  layout and fail with "no account activity". A real statement with a
  layout that differs from the public sample (for example, descriptions
  that wrap onto a second line) may need template changes. A dropped row
  can't go unnoticed, because reconciliation blocks the import.
- Vercel caps request bodies at 4.5 MB, below ADR-044's 10 MB.
- E2E runs leave objects in the `storage-tests` bucket; nothing clears it
  yet.
- One full E2E run on 2026-10-10 failed across unrelated specs (calendar,
  auth, import) with ~2.7-minute timeouts. The next full run and the import
  spec alone passed. Cause not found; watch for it in CI.
- Deleting a workspace (F-19, not built) must also delete `w/<ws>/` from
  the bucket.
- A failed storage delete leaves an orphaned CSV, logged by id.
- Imported rows are not categorized or paired as transfers yet (F-08,
  ADR-020).

---

## HO-039: F-32 agent worker: relays texts between Photon and the app

- **Date:** 2026-10-10 22:30 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `feat/agent-worker` (uncommitted) / not opened

### What changed
- **The repo is a pnpm workspace** (ADR-032): the app at the root,
  `agent-worker/` and `packages/agent-protocol/`. Root `pnpm lint`,
  `pnpm typecheck` and `pnpm test:unit` cover all three.
- **`agent-worker/`**, written by hand (Photon's scaffold command was not
  run). For each inbound text in a direct chat it shows the typing
  indicator, posts the text to `/api/agent/turn` with the service token, and
  sends the reply. On any failure it sends a fixed "try again" reply.
  - It has no business logic and reaches nothing but Photon and the app.
  - Own messages, group chats and anything that is not text are ignored.
  - One conversation is answered in order; others do not wait.
  - `GET`/`HEAD /health`, and a self-ping every 10 minutes when
    `RENDER_EXTERNAL_URL` is set (ADR-041).
  - It runs on Node 24 directly from TypeScript; its only new dependency is
    `spectrum-ts` 12.10.1.
- **`packages/agent-protocol/`** holds the turn schemas, moved from
  `src/features/agent/domain/protocol.ts`, and the platform list.
- **`terminal` platform** for development: Spectrum's terminal chat. A
  deployed app (on Vercel) answers 400 to it, because its handles are not
  phone numbers anyone has proven they own.
- **Email outbox writes are atomic** (`src/lib/email/send.ts`): the file
  is written under a temporary name and renamed. Playwright specs were
  failing now and then with "Unexpected end of JSON input" because they
  read the outbox while the server was still writing to it.
- `.gitignore` ignores `node_modules/` in workspace packages too.
- **Tests:** Vitest for the worker's settings, message mapping, relay,
  queue, health server and loop. Run by hand with the terminal provider
  against a local production build: three texts answered in order.

### What's next
- **Try it locally:** copy `agent-worker/.env.example` to
  `agent-worker/.env`, set `AGENT_SERVICE_TOKEN` to the same value as in
  `.env.local`, run `pnpm dev`, then `pnpm --filter agent-worker dev` in a
  second terminal and type in the chat.
- **Real texts:** in `agent-worker/.env` set `AGENT_PROVIDER=imessage`,
  `PHOTON_PROJECT_ID` and `PHOTON_PROJECT_SECRET`. On Photon's free plan the
  phone must be registered as a project user in the Photon dashboard.
- **Deploy to Render** as a web service from this repository:
  - Build command: `pnpm install --frozen-lockfile`
  - Start command: `pnpm --filter agent-worker start`
  - Health check path: `/health`
  - Environment: `NODE_VERSION=24`, `AGENT_PROVIDER=imessage`,
    `PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`,
    `REEFLECT_URL` (the production origin), `AGENT_SERVICE_TOKEN` (the same
    value as on Vercel).
- **`POST /send` and the 5-minute job tick** arrive with F-26, the first
  feature where the agent texts first.
- **F-25** makes a linked phone get real answers.

### Open problems
- **Tried with a real phone on 2026-10-10:** worker run locally with
  `AGENT_PROVIDER=imessage` against the local app. Sign-up reply, LINK,
  Approve on the website and the linked reply all worked over iMessage.
- **Photon's free plan allows 10 people, each added by hand.** Photon
  dashboard > Spectrum > Users > Add user. Each person's row shows a "Texts
  on" number: that is the number that person texts, and it can differ from
  person to person (shared pool). So there is no open sign-up on this plan,
  and `AGENT_PHONE_NUMBER` should stay unset: one number shown to everyone
  would be wrong for some of them. For the demo, add each judge's phone
  first (ADR-034's "Try it" flow assumes one number for all judges).
- Not tried: a text from a phone that is not in the Users list, and the
  worker on Render.
- A burst of texts gets one reply each. Photon's debounce pipeline is left
  until Gemini answers (F-25).
- The worker does not retry a failed send, and the app does not yet ignore
  a turn it has already seen.

## HO-040: CSV import (F-05) for Capital One exports, through the PDF pipeline

- **Date:** 2026-10-10 (EDT)
- **Author:** Simon Ormond with Claude (Claude Code)
- **Branch / PR:** `feat/csv-statement-import` / not opened

### What changed
- **ADR-054 (Proposed):** CSV import reads Capital One's two exports with
  built-in formats, recognized by header names: 360 checking and savings
  (a balance after every row) and credit card (no balances). There is no
  column-mapping screen or `csv_mapping` table yet. ADR-044's status line
  now says ADR-054 refines its CSV pipeline. **The team should confirm it.**
- **Migration `0007_import_batch_optional_balances`:** `import_batch`'s
  opening and closing balances can be null, for a card export.
- **`src/features/imports/`:**
  - `domain/csv-records.ts`: the RFC 4180 reader, taken out of `csv.ts`. Upload
    mode accepts a BOM, LF or CRLF and blank lines; canonical mode is as
    strict as before.
  - `domain/templates/capital-one-csv.ts`:
    - 360: the sign comes from Transaction Type, the row order from the
      balance chain (the export lists newest first), and the opening
      balance is worked out from the first row.
    - Card: Debit is negative and Credit positive, and there are no
      balances.
    - Only the chosen account's rows are read, and only the last 4 digits
      of the account number are kept.
  - `ParsedStatement`: `accountType` became `accountTypes` (a 360 export can
    be checking or savings), and the balances can be null.
  - Checks: when a file has no balances, reconciliation, running balance
    and continuity are skipped. `readStoredRows` re-reconciles only when
    there are balances.
  - Pipeline: `previewStatement` picks a PDF or CSV reader, and everything
    from the parsed statement on is shared. `import_batch.kind` and
    `transaction.source` are `csv` for these imports. A file without
    balances never changes the account's balance.
  - Actions were renamed to `previewImportAction` and `commitImportAction`.
    A CSV is limited to 2 MB and 10,000 rows.
  - UI:
    - one field, "Statement (PDF or CSV)"
    - "Not in this file" for missing balances, with a note
    - no Balance column when there are none
    - the waiting list names the format
- `src/lib/money`: `parseExportAmount`, for plain export amounts with 0 to 2
  decimals.
- **Fixtures:** `tests/fixtures/csv/`, synthetic and hand-written.
- **Tests:** `pnpm test:unit` (1115) and `pnpm test:e2e` (83, including the
  new `csv-import.spec.ts`) pass. `pnpm lint`, `typecheck`, `build` and
  `scan:bundle` pass. Storage tests ran against the `storage-tests` bucket.

### What's next
- Upload a **real Capital One CSV export** (360 and card) and check its
  header names against ADR-054. Keep it in a gitignored
  `tests/fixtures/**/private/` folder. Adjust the names in
  `capital-one-csv.ts` if they differ.
- `pnpm db:migrate:to production` for migration 0007 when this merges,
  after HO-038's 0006.
- Gemini reading the stored CSVs (ADR-053, ADR-019, ADR-040), the same
  canonical file for PDF and CSV imports.
- The mapping screen and `csv_mapping`, when another bank is needed.

### Open problems
- ADR-054 and ADR-053 are Proposed, not Accepted.
- The column names come from Capital One's documented exports, not from a
  real file.
- A PDF and a CSV of the same period dedupe only where their descriptions
  match, so importing both may add some rows twice.
- A card export never updates the card's balance; it stays as typed.
- Imported rows are not categorized or paired as transfers yet (F-08,
  ADR-020): a card payment shows on both accounts.

## HO-041: Generator v2 (retirement, investing), ADR-055 and ADR-056, a 100-person year batch

- **Date:** 2026-10-10 21:20 (EDT)
- **Author:** Jacob Heminway with Claude (Claude Code)
- **Branch / PR:** `feat/insights` (uncommitted) / not opened

### What changed
- **ADR-055 (Proposed):** money into retirement (an IRA) or a brokerage
  counts as saving, not spending (refines ADR-020). A 401(k) is known only
  from the user's answer to an action-required retirement question, shown
  without alarms. AGENTS.md section 2 and SYNTHETIC.md rule 7 now draw the
  line: amounts in are fine; holdings, prices, returns and trades are not.
- **ADR-056 (Proposed):** the insights comparison that ADR-049 asked for.
  Each sample person's figures are stored at batch load in an
  `insight_sample` table (not built yet); the page compares you with the
  10 sample people just above and 10 just below you by take-home, or with
  everyone, over the last 30, 90 or 365 days.
- **PROJECT.md:** F-35 (compare with people like you) and F-36 (retirement
  question), both Later under ADR-043.
- **Generator v2** (`src/features/synthetic`): spec fields `retirement`
  (`employer` / `own` / `none`) and `investing[]`; new rows of kind
  `investment` with category "Retirement" or "Investing", out of checking,
  stored with `is_transfer = true` and no pair; `personStats` leaves them
  out of spending. `GENERATOR_VERSION` is 2: a spec without the new fields
  gives the same rows as v1 (tested), but a v1 checkout would silently drop
  the new rows. SYNTHETIC.md documents the fields and a retirement mix
  (rule 10).
- **Batch `year-100-nc`** (`scripts/batch/specs/year-100-nc.json`) loaded on
  the batch-testing branch: id `01a12882-d73f-72be-8d84-60e5d2de94fb`, seed
  `year100`, 100 people, 2025-10 to 2026-10-10, 234 accounts, 48,743
  transactions, about 10 seconds to load. The first 50 people are
  `first-50-nc`'s; the other 50 are varied copies. Students overdraw and
  outspend, which was accepted.
- **Tests:** Vitest for the new spec fields, the expander rows, stats and the
  loader's transfer mark. `pnpm lint`, `pnpm typecheck` and `pnpm docs:check`
  pass. All non-database unit tests pass.

### What's next
- The fast-path steps are in Jacob's `insights_plan.md` (gitignored):
  `quantile` in `src/lib/money`, then `insights/domain` (periods, metrics,
  cohort), then the `insight_sample` table, the page, `pnpm batch attach`,
  the retirement question, and the production load.
- The team to confirm ADR-055 and ADR-056.
- F-08 (categories) is unassigned; our own accounts need it for spending by
  category on Insights.

### Open problems
- **`first-50-nc` is generator v1**, so `promote` refuses it from this code.
  Reloading it under v2 gives the same rows.
- **`pnpm db:migrate` was run by mistake** with no local database. Every
  target in Jacob's `.env.local` points at the batch-testing branch, so it
  went there and at most applied `0003_phone_linking` (three empty tables).
  Production was not touched.
- **No Docker on Jacob's machine:** the 38 database-backed unit tests and
  the e2e suite were not run for this change.

---

## HO-042: Eighteen preset categories (ADR-057); sample people arrive categorized

- **Date:** 2026-10-10 23:10 (EDT)
- **Author:** Jacob Heminway with Claude (Claude Code)
- **Branch / PR:** `feat/insights` (uncommitted, on top of the merge of
  main) / not opened

### What changed
- **ADR-057 (Proposed):** F-08's presets go from eight to eighteen. The
  first eight are unchanged and in the same order. Added after them:
  health, insurance, loans, subscriptions, personal care, kids & childcare,
  gifts, travel, retirement, investing. Existing workspaces gain them on the
  next editor visit (same idempotent seed). `PRESET_CATEGORIES` and a
  `PresetKey` type are now exported from `@/features/categorization/client`.
- **Generator → presets:** `PRESET_FOR` and `planCategories` in
  `src/features/synthetic/domain/categories.ts`.
  - The generator keeps its finer categories, so the rows are unchanged and
    it stays at generator v2.
  - **Rules:** a merchant that always means one preset gets an exact rule.
  - **Manual choices:** a merchant used for two things gets these instead.
  - **Uncategorized:** Other, Education, card interest and transfer pairs.
  - **Tested against F-08's own engine:** every generated row gets the
    category `categorizeTransaction` computes from the plan.
- **Batch loader** (`scripts/batch/rows.ts`, `store.ts`): every sample
  workspace gets the presets, its rules and a `category_id` on every row.
  `pnpm batch delete` removes them through the workspace cascade.
- **Batch-testing branch:**
  - **Migrated:** `pnpm db:migrate:to branch` applied 0004 (the branch's
    3 users marked email-verified) and 0005 (categories).
  - **The "1 recorded migration not in this checkout"** is an old draft
    stamped between 0000 and 0001, so it is harmless.
  - **`year-100-nc` reloaded** with seed `year100` and as-of 2026-10-10.
    Same 48,743 transactions; new id
    `01a128e5-20d4-7f2c-acbe-1c3c2ee6f056`. The old id `01a12882-…` was
    deleted.
  - **Result:** 1,800 categories, 18–40 rules per person and 195 manual
    rows. About $35.7k of $3.9M spending is Uncategorized.
- **Docs:**
  - DECISIONS (ADR-057).
  - ARCHITECTURE (category table row).
  - PROJECT (F-09).
  - SYNTHETIC (how the loader categorizes).
  - The categorization README.

### What's next
- Muhammad (F-08 owner) to look over ADR-057 and the new presets.
- Insights steps 4 onward in Jacob's `insights_plan.md`: `quantile`, then
  `insights/domain` (periods, metrics by preset key, cohort).
- Starter rules for the Nessie demo accounts: Jacob, on a separate branch,
  later.

### Open problems
- **Not run here (no Docker):**
  - The new store test.
  - The updated categorization repository test.
  - The other database-backed tests.
  - The e2e suite.
  CI must cover them.
- `first-50-nc` (generator v1, no categories) is still on the branch.


## HO-043: Insights page (F-35): compare with sample people (ADR-056)

- **Date:** 2026-10-11 00:30 (EDT)
- **Author:** Jacob Heminway with Claude (Claude Code)
- **Branch / PR:** `feat/insights` (main merged in and staged, not yet
  committed; this work unstaged on top) / not opened

### What changed
- **Merged main** (Simon's PDF import, #16). Simon's ADR-053 and HO-038
  keep their numbers, so ours moved: ADR-055 (retirement and investing as
  saving), ADR-056 (insights), ADR-057 (presets), HO-041 and HO-042.
- **`src/lib/money`:** `quantile` (linear, rounded to the cent) and
  `fiveNumbers`.
- **`src/features/insights/`** (new):
  - `domain/periods.ts`: the last 30, 90 and 365 days; per-month scaling;
    the days your data covers.
  - `domain/metrics.ts`: one person's measures for a period from plain
    rows: take-home, spending per preset key plus Uncategorized, kept,
    saved, bills, subscriptions, no-spend days, lowest checking balance.
  - `domain/cohort.ts`: the 10 below and 10 above you by take-home (20
    nearest at the ends), group size, range and persona mix, quartiles,
    neutral placement wording and the slight tints.
  - `domain/workspace.ts`: stored rows → measures. The one path for both
    sample figures and yours.
  - `server/`: `getInsights` (viewer access, in the isolation matrix) and
    the repository; `ui/`: the page.
- **F-08:** `classifyStored` moved from the repository into the domain and
  is exported from `client.ts`, so Insights and batch rollups compute
  effective categories with F-08's own code. `listCategories` returns
  `presetKey`.
- **`insight_sample` table** (migration 0007, renumbered 0008 in HO-044): one row per sample person,
  period and measure. `pnpm batch load` and `promote` write it in the
  same transaction; **`pnpm batch rollup <batchId>`** recomputes it.
- **The page** at `/w/[workspaceId]/insights`:
  - Your take-home and the group's take-home range at the top, with the
    persona mix.
  - Period (30 days, 3 months, year) and People like you / Everyone as
    links, so every state is in the URL.
  - Spending by category with a small "Show as" dollars / share switch,
    and a line saying how much is Uncategorized, linking to Transactions.
  - Where you stand: strips with the middle half, typical and you, with
    the placement in words. Pale green or warm tints echo the words.
- **Batch-testing branch:** migrated to our `insight_sample` migration (also applied main's 0006);
  `rollup` wrote 6,099 figures for `year-100-nc`. The page uses the
  newest batch that has figures, so `first-50-nc` (no figures) is never
  used.
- **Line endings:** files that were checked out with CRLF were converted
  back to LF, matching `.gitattributes`; git shows no content change.
  `pnpm format:check` no longer flags them.
- **Tests, now that Docker runs here:** domain, server (`getInsights`),
  store (load, rollup, delete) and the isolation matrix; Playwright
  `insights.spec.ts`. `categorization.spec.ts` expected 8 presets and now
  expects 18 (ADR-057; it couldn't run here before). The whole e2e suite
  passes (83), and every unit test except Simon's storage tests.
- **Docs:** ADR-056 updated with what was settled while building;
  ARCHITECTURE (`insight_sample`, `insights`), PROJECT (F-35), SYNTHETIC
  (`rollup`), AGENTS.md section 5.

### What's next
- Commit the staged merge, then this work (Jacob).
- Starter rules for the Nessie demo accounts (Q26), so a demo user's
  spending isn't mostly Uncategorized.
- `pnpm batch attach` / `detach` to make developers members of a sample
  workspace; the retirement question (F-36).
- Production: after Q21, `db:migrate:to production` and `batch promote`
  (which writes the figures too).

### Open problems
- The 401(k) part of "saved" waits for F-36's answer; today saved counts
  savings transfers, IRA and brokerage rows only.
- Simon's storage tests need `.env.storage-tests` (`neon env pull --branch
  storage-tests`); without it 6 unit tests fail locally. Everything else
  passes.
- ADR-055, ADR-056 and ADR-057 are still Proposed.

## HO-044: Main merged again (agent worker #17, CSV import #18)

- **Date:** 2026-10-11 (EDT)
- **Author:** Jacob Heminway with Claude (Claude Code)
- **Branch / PR:** `feat/insights` / not opened

### What changed
- Main's ADR-054 (CSV import), HO-039 and HO-040 keep their numbers; ours
  are now ADR-055 (retirement and investing), ADR-056 (insights), ADR-057
  (presets), HO-041, HO-042 and HO-043.
- Both branches added a migration 0007. Main's
  (`0007_import_batch_optional_balances`) is kept; ours is regenerated as
  `0008_insight_sample`.
- Batch-testing branch: the old `insight_sample` record and table were
  removed, then `pnpm db:migrate:to branch` (9 of 9) and `pnpm batch
  rollup` (6,099 figures, as before).
- Main's assignments row for F-05 cited HO-039; it now cites HO-040.

### What's next
- Find which e2e page logs `RangeError: Money must be a whole number of
  cents` on the server. No test fails.

### Open problems
- Simon's storage tests (8) need `.env.storage-tests` to run locally.

## HO-045: Recurring payments website (F-10), from observed patterns

- **Date:** 2026-10-11 04:45 (UTC)
- **Author:** Muhammad Tahub Khatri with Codex
- **Branch / PR:** `feat/subscriptions` / not opened; implementation uncommitted

### What changed
- **ADR-058 (Accepted):** the user approved broadening subscriptions into
  recurring payments and finding patterns instead of fixed constructs.
  ADR-014 is superseded; its original decision is preserved. Main's
  ADR-055–057 and migration 0008 retain their numbers.
- Full website at `/w/[workspaceId]/subscriptions`: date-pattern suggestions,
  variable bills and fixed subscriptions, confirmation before estimates,
  evidence/range, actual spending net of matching credits, expected/user dates,
  monthly/yearly estimates, bill/subscription breakdown and potential savings.
  Manual tracking, corrections, dismissal/restoration and subscription
  keep/planning-to-cancel persist. Filters and pagination retain workspace totals.
- `src/features/recurring/` contains the domain, repository, six editor-only
  actions, read-only viewer page and public integration APIs. Reads derive
  current evidence without writing; serialized metadata writes preserve user
  choices and never alter transactions or balances. Failures retain form input
  or show the page's retry boundary while navigation stays available.
- **Migration `0009_recurring_payments`:** recurring metadata, a unique
  workspace/account/payee key and composite account ownership with cascades.
  The account ownership index precedes the dependent FK in generated SQL.
- Integrated main through **`c75ec7d`** (PDF/CSV, worker and Insights). Resolved
  documentation/authorization overlaps while retaining both features. No
  importer, Insights, money or generator code is changed by this branch.
  The longer navigation label required a minimum width for the signed-in
  identity; existing navigation/auth browser tests verify it remains visible.
- Updated PROJECT, ARCHITECTURE, DECISIONS, TESTING and PITCH. The
  [feature README](../src/features/recurring/README.md) explains the algorithm's
  evidence/resource guardrails, false positives, amount/date sources and API
  contract. Reminder delivery, proactive texts and live calendar integration
  remain F-22/F-26 or their owning features.

### Verification
- Strict app/worker types, lint, format, docs checks, production build and
  client bundle scan pass. `git diff --check` passes; final main fetch matched
  `c75ec7d`, with no unresolved merges.
- **1,264 unit/database tests passed in 84 files**, with coverage thresholds
  passing (95.51% overall lines, 91.52% branches). Recurring domain: 100% lines,
  97.83% branches; recurring server: 99.35% lines, 97.02% branches. One existing
  account storage test was excluded by CLI name filtering, plus the three
  external-storage test files listed below; no test/config was changed to skip
  them. Authorization includes all six recurring actions and Insights.
- Real PDF and CSV public preview/commit actions, parsers, reconciliation and
  PostgreSQL writes pass in the recurring integration tests. Only session and
  external object transport are faked in that feature-owned test file. Patterns
  appear immediately after commits; confirmation/refresh preserves financial
  facts. This does not replace Neon's storage integration checks.
- **88 browser tests passed**, covering auth, navigation, accounts, transactions,
  categorization, Insights, calendar, messaging and all ten recurring flows.
  Recurring tests assert no unexpected browser errors; injected failure recovers.
  Light/dark screenshots at desktop and 360px, with reduced motion, are in
  [screenshots/recurring](screenshots/recurring/desktop-light.png).
- Dedicated local PostgreSQL databases only: blank application of all ten
  migrations and main's nine-migration database upgrading to ten both pass.
  Existing balances, imported transactions, manual categories, rules, import
  records, synthetic metadata and Insights sample figures remain unchanged;
  a second application is idempotent. Production was not migrated.

### What's next
- Run the full unit suite and `pdf-import.spec.ts` / `csv-import.spec.ts` when
  the running workspace can reach the existing Neon `storage-tests` endpoint.
  The excluded unit files are `src/lib/storage/index.test.ts`,
  `src/features/imports/server/pipeline.test.ts` and
  `src/features/imports/server/actions.test.ts`; also rerun the account's
  stored-statement deletion test.
- Obtain specific commit/push/PR authorization under AGENTS.md section 7.
  Suggested commit: `feat(recurring): track payments from observed patterns`.
- Before deployment, verify the target's migration history (HO-038/ADR-049)
  and apply 0009 after main's 0008. Consumers authorize first and use the
  public APIs; post-import refresh failures must not undo successful imports.

### Open problems
- Neon is connected and the user reported saving the storage allowlist change.
  The running environment's enforced network policy at revision 18 still lists
  only Playwright/font/Google-storage hosts and package-manager presets.
  `br-polished-hall-b439q9bu.storage.c-6.us-east-2.aws.neon.tech` returns HTTP 403
  from the workspace proxy; there is no networking-settings edit tool. Real
  Neon object-storage/import regression results remain pending. The temporary
  storage-only test credential was revoked and its gitignored file removed.
- Main's imports do not yet categorize or pair transfers (HO-040); only rows
  marked as transfers can be excluded. Recurring analysis never rewrites them.
  The README documents missing cycles, ambiguous payees and false positives.

## HO-046: Recurring payments authorized for commit, push and PR

- **Date:** 2026-10-11 00:52 (America/New_York, EDT)
- **Author:** Muhammad Tahub Khatri with Codex
- **Branch / PR:** `feat/subscriptions` / PR creation follows this commit

### What changed
- The user explicitly requested pulling main, resolving conflicts and opening
  the PR for the complete feature. This authorizes the commit and branch push.
- Fetched main again: both the branch base and `origin/main` are `c75ec7d`.
  The branch is already current; no new conflicts or code changes were needed.
  All feature files, tests, migration 0009, ADR-058 and screenshots are included.
- HO-045's final verification still applies to this unchanged implementation:
  1,264 unit/database tests, 88 browser tests, strict types, lint, production
  build, bundle scan and blank/existing-main migration checks passed.
  Documentation, formatting and staged-diff checks are rerun for publication.

### What's next
- Open the PR into `main` and verify GitHub reports no merge conflicts.
- Required CI and review still gate merging (ADR-021). Apply migration 0009
  after main's 0008 before deployment; production has not been changed.

### Open problems
- The running environment's network policy at revision 19 still omits the Neon
  storage host. HO-045 lists the local storage regressions that remain blocked.
  The PR discloses these exclusions; GitHub CI uses the existing repository
  test-storage credentials to run the full suite. No tests are disabled in code.

## HO-047: Fix the recurring PR's CI isolation snapshot failure

- **Date:** 2026-10-11 01:05 (America/New_York, EDT)
- **Author:** Muhammad Tahub Khatri with Codex
- **Branch / PR:** `feat/subscriptions` / [PR #20](https://github.com/TahubCS/Reeflect/pull/20)

### What changed
- CI run `38113112063` passed 1,307 unit tests and failed one workspace
  isolation assertion. The category rows and values were unchanged, but an
  unordered SQL query returned them in a different order. Browser, lint/types
  and dependency audit jobs passed, including the real Neon import tests.
- Order every directly queried isolation snapshot table by its primary key.
  The test still compares all rows and columns, including recurring metadata;
  unauthorized inserts, updates or deletes still fail the comparison.
- Add a real PostgreSQL regression that switches between sequential and
  index scans with transaction-local planner settings and no data changes.
  It fails before the fix and passes afterwards. Documented in TEST-06.
- This follow-up changes tests and documentation only. Main is still `c75ec7d`;
  no application code, schema, CI configuration or storage credentials change.

### Verification
- All 106 workspace isolation tests pass locally, including the new regression.
  Strict app/worker types, lint and formatting pass.
- The broader local suite passes 1,265 tests in 84 files with coverage
  thresholds passing (95.51% lines, 91.52% branches), using HO-045's disclosed
  storage exclusions. Two timeouts during concurrent lint/type checks pass
  when rerun with two workers and those checks complete; no deadlines changed.
  The full suite and real storage checks run in GitHub CI after pushing the fix.

### What's next
- Push the fix to PR #20 under the user's existing publication authorization,
  then verify the full unit job passes on that commit. No tests are disabled.
- CI and teammate review still gate merging; production has not been migrated.

### Open problems
- HO-045's local Neon storage network restriction remains. CI can reach the
  test bucket and passed its storage/import tests in the initial PR run.

## HO-048: The calendar runs on the workspace's own accounts (F-12, F-13)

- **Date:** 2026-10-11 (EDT)
- **Author:** Simon Ormond with Claude (Claude Code)
- **Branch / PR:** `feat/real-cashflow-dashboard` / not opened

### What changed
- **The sample is gone.** `/w/[workspaceId]/dashboard` is a server page.
  `loadDashboard` (`src/features/cashflow/server/load.ts`) reads the
  workspace's accounts, transactions, categories and phone link and hands
  them to `CashflowDashboard`. Removed:
  - `demo-data.ts`
  - the text simulator (`read-text.ts`, `text-thread.tsx`)
  - the "Sample data" note and the footer
- **`toCashflowData`** (`src/features/cashflow/domain/from-records.ts`) is
  pure and turns those rows into the calendar's data:
  - **Balance:** checking plus savings (ADR-024). Today's balance equals the
    stored balances; the opening balance is worked back through the window's
    rows up to today.
  - **Window:** two months back, two ahead (`dashboardWindow`).
  - **Card rows** show as spending, labelled "on card · <account>", without
    moving the balance line (`Entry.onCard` in `cashflow.ts`). Transfers
    (ADR-020) and a loan account's own rows are left out.
  - **Kinds:**
    - money in → income
    - Housing, Utilities, Insurance and Loans presets → bill
    - the rest → spending

    Sources: manual and text keep their names; every import or sync reads
    as "from your bank".
  - **`recurring` is empty** until recurring series exist, so the headline
    shows "You have $X today." Subscriptions show a note instead of a list.
- **Day panel:**
  - `addDayEntryAction` and `removeDayEntryAction`
    (`src/features/cashflow/server/actions.ts`) add and remove real typed
    transactions through the transactions feature's repository. They follow
    ADR-050's rules: today or earlier, and the balance moves. They refresh in
    place (`refresh()` from `next/cache`), so the month and day stay put.
  - The panel offers the workspace's categories ("Choose for me" lets the
    rules pick) and an account picker, defaulting to checking, when there
    are several accounts.
  - Only typed rows have a remove button; imported rows link to their
    transaction page. Viewers get no form. Future days explain that adding
    stops at today.
- **No accounts:** a new workspace sees "Add an account to see your month."
  with links to add an account or import a statement.
- **Sources section:** real counts per source, plus the phone-link state
  from Settings.
- **Transactions:** `listTransactionsBetween` (with each row's category).
  `createTransaction`, `deleteTransaction` and `parseTransactionForm` are
  exported from the feature's index; categorization exports `saveOverride`.
- **Accessibility:** the day panel's selects use `htmlFor`, so their names
  no longer include the option text.
- **Tests:**
  - Vitest:
    - `from-records.test.ts`
    - card rows in `cashflow.test.ts`
    - `listTransactionsBetween`
    - `cashflow/server/actions.test.ts` (loader and actions, roles)
    - three new entries in the isolation matrix (TEST-06)
  - Playwright: `calendar.spec.ts` rewritten for real users. `auth`,
    `workspaces` and `app-nav` no longer expect the sample headline.
  - Results:
    - `pnpm test:unit`: 1206 passed before the merge with main. One run
      failed once, in the isolation matrix's `addDayEntryAction`
      cross-workspace case. That is likely the unordered snapshot HO-047
      fixed on main, which this branch now includes.
    - `pnpm test:e2e`: 83 passed.
    - `lint`, `typecheck`, `format:check`, `build`, `scan:bundle` and
      `docs:check` pass.
- **Docs:**
  - PITCH.md has a note that the 1:00 step must not claim upcoming paydays
    and bills yet.
  - Assignments table: F-12 and F-13 are Simon's.

### What's next
- **Feed the calendar from recurring payments:** F-10's recurring payments
  (`src/features/recurring`, ADR-058) merged into main while this branch
  was open. Map confirmed series into `CashflowData.recurring` (income,
  bills, subscriptions), and keep the cancel marks in that feature's state
  instead of the dashboard's local state. That turns on the per-day
  headline, the dotted line and the subscriptions list without changing
  the calendar UI.
- **Detect paydays:** check whether ADR-058 covers recurring income. The
  headline needs the next payday (ADR-042). If it doesn't, write the ADR.
- **Demo script:** bring the 1:00 step back to "paydays and bills on their
  days" once that lands.

### Open problems
- **Imported rows without a balance:** the opening balance assumes the
  stored balance is today's. A statement import that leaves the balance
  older than its rows (a card export, ADR-054) can be off; card rows don't
  move the line, so this mostly affects checking imports.
- **Card payments and refunds:** until transfer pairing (F-08, ADR-020), an
  unpaired card payment shows as money in on the card, and the checking side
  as spending.
- **The Subscriptions category** reads as spending, not as a subscription,
  until the calendar reads recurring payments.

---

---

## HO-049: Agent worker live on Render; replies are placeholders for now

- **Date:** 2026-10-11 01:30 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `feat/agent-answers` (uncommitted) / not opened

### What changed
- **The worker (F-32) is deployed on Render** as a free web service from
  `main`, calling the production app. Nothing in the code changed.
  - Build command `pnpm install --frozen-lockfile`, start command
    `pnpm --filter agent-worker start`, health check path `/health`,
    `NODE_VERSION=24`.
  - `AGENT_SERVICE_TOKEN` is set on Render and on Vercel (Production) with
    the same value.
- **Tested from three phones** on Photon's free plan: the owner's and two
  more added under Photon dashboard > Spectrum > Users. All got replies.
- **What a phone gets today is a placeholder.** The sign-up reply, LINK,
  Approve on the website and STOP are real. Any other text from a linked
  phone gets the fixed line "You're linked. I can't answer questions here
  yet; that's coming." Real answers arrive with F-25.

### What's next
- **Keep-awake backup (ADR-041):** add a free monitor (UptimeRobot or
  cron-job.org) that requests the service's `/health` every 5 minutes. The
  worker already pings itself every 10 minutes; the monitor also wakes it
  after a restart.
- **Render redeploys the worker on every merge to `main`.** A Build Filter
  for `agent-worker/**`, `packages/**` and `pnpm-lock.yaml` limits that.
- **F-25** is next: Gemini answers "how am I doing?" from accounts and
  transactions.

### Open problems
- `/health` says the process is up, not that the Photon connection is
  healthy. If texts stop getting replies while the monitor is green, read
  the Render logs.
- Only people in Photon's Users list (10 on the free plan) can use the
  agent, each on their own "Texts on" number.
- Not tried: a text from a phone that is not in the Users list.

---

## HO-050: F-25 "how am I doing?": Gemini writes the reply, code supplies every figure

- **Date:** 2026-10-11 03:00 (EDT)
- **Author:** Muhammad Tahub Khatri with Claude (Claude Code)
- **Branch / PR:** `feat/agent-answers` (uncommitted) / not opened

### What changed
- **ADR-059 (Proposed):** one model request per text with labels, two checks
  on every draft, a chain of up to six models, nothing kept at Google, no
  conversation memory, and the current key used for real users' texts for
  now.
- **A linked phone now gets a real answer.** `runAgentTurn` sends any text
  that is not LINK or STOP to `answer` (`src/features/agent/server/`):
  1. `getSummary` works out the figures: cash, what is owed, and the last
     30 days from Jacob's `workspaceMeasures`, so they match the Insights
     page.
  2. The model gets label names (`{cash_total}`, `{spending}`, …) and the
     person's text, never a figure, and writes two or three sentences.
  3. Code rejects a draft with a digit of its own, an unknown label, a
     stray brace or too many characters, then fills the labels in.
  4. If no model answers or the draft is rejected, code builds the reply
     from the same figures.
- **`src/lib/ai/`** (ARCH-07): the chain, the Google transport, label
  filling and the digit scan. New dependency: `@google/genai` 2.28.0.
- **`pnpm ai:check`** tests the real key against each model. Run on
  2026-10-11: `gemini-3.6-flash`, `gemini-3.5-flash`,
  `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` answered and followed
  the label rule. `gemini-3.8-flash` and `gemini-3.7-flash` were overloaded
  or rate-limited at the time; both accept the request shape.
- **Settings:** `GEMINI_API_KEY` and `GEMINI_MODELS`, both optional, in
  `src/lib/env.ts`, `.env.example` and ARCH-09 (which called the second
  `GEMINI_MODEL`). Playwright sets the key to empty, so tests never call
  Google.
- **Jacob's file:** `src/features/insights/server.ts` now also exports
  `loadWorkspaceData` and `yesterday`.
- **Tests:** Vitest for the chain, transport, filling, digit scan, facts,
  prompt, code-built replies and `answer` (against the Docker database,
  with a fake model); `agent-link.spec.ts` expects an answer, not the
  placeholder.

### What's next
- **To go live:** add `GEMINI_API_KEY` to Vercel (Production) and redeploy.
  Until then the live agent answers with the code-built reply.
- **Production is missing migration `0009_recurring_payments`** (checked
  with `pnpm db:whoami` on 2026-10-11). The agent does not read those
  tables, but the Subscriptions page does.
- **F-28** (category and balance questions) is next: it adds lookups and
  with them Gemini's tool calling.

### Open problems
- **Not in this feature:** "owed before payday", the per-day figure and the
  week-ahead image. They need bills and paydays, which do not exist yet.
- The figures are monthly amounts based on the days covered, as on the
  Insights page, not exact 30-day totals.
- No conversation memory: "and last month?" gets a fresh answer, not a
  follow-up.
- A model that is slow rather than failing costs up to 4 seconds before the
  next one is tried; after one such wait it is left alone for five minutes.
- The model chain's "leave it alone" memory is per server instance.
- ADR-019's rule about which kind of key may see real users' text is set
  aside for now (ADR-059).


## HO-051: Next-feature review recommends complete monthly budgets (F-09)

- **Date:** 2026-10-11 05:36 (UTC)
- **Author:** Muhammad Tahub Khatri with Codex
- **Branch / PR:** `chore/next-feature-review` / not opened

### What changed
- Reviewed main `b852d82`, product/architecture/decisions/testing docs, all
  current feature areas and the ledger/category boundaries for candidate work.
- User confirmed Simon owns dashboard integration and Jacob owns Insights
  and a previous year of mock activity for the team's accounts.
- Added [NEXT_FEATURE_PLAN](NEXT_FEATURE_PLAN.md): recommends full F-09 on
  `feat/monthly-budgets`, with scope, competing candidates, financial rules,
  ownership boundaries, domain/PostgreSQL/browser tests and migration rollout.
- Verified main's CI and CodeQL passed on the reviewed commit. No application
  changes, database writes, commits, pushes or PR were made.

### What's next
- User reviews the proposal. If approved, build the complete budgets page,
  persistence, permissions and tests from fresh main, keeping dashboard,
  Insights, mock-data generation and imports with their existing owners.

### Open problems
- Imports do not automatically pair transfers/card payments; budget accuracy
  requires correct transfer marks and categories. Document recorded-data scope.
- Shared schema/migration metadata, isolation registration and docs can still
  conflict with concurrent branches; synchronize before final verification.

## HO-052: Complete F-09 monthly budgets, with migration and regression evidence

- **Date:** 2026-10-11 02:20 (EDT)
- **Author:** Muhammad Tahub Khatri with Codex
- **Branch / PR:** `feat/monthly-budgets` / not opened; worktree `/workspace/Reeflect-budgets`

### What changed

- User approved the complete [budget plan](NEXT_FEATURE_PLAN.md). Built the
  page, pure calculations, server read/actions, allocation persistence and
  generated migration `0010_monthly_budgets.sql`. ADR-060 records the approved
  interactions; [feature README](../src/features/budgets/README.md) documents
  the behavior, APIs and rollout.
- Current/next-month allocations, historical reads, copy into missing plans,
  zero vs unset, refund-adjusted actuals, unbudgeted/Uncategorized visibility,
  editor controls, read-only viewers, validation, success/pending states and
  retry recovery are included. No dashboard, Insights, import, generator or
  agent implementation was changed.
- Reads use owned account/category joins, effective rules/manual choices and
  one repeatable-read snapshot. Writes are workspace-scoped and serialized;
  copy is atomic, idempotent and never overwrites existing zero allocations.
  No budget operation changes ledger rows or balances.
- Synced with main `8c4a472f5c1e4009d99fd23dae8f47392874f0ae` (agent PR #22),
  checked again at the end. Preserved main's ADR-059 and HO-049/HO-050; moved
  the previously uncommitted planning entry to HO-051. Application files
  merged without conflicts; the handoff append was resolved.
- Validation:
  - 95 budget Vitest tests pass. Domain and server operation files have 100%
    line/branch coverage; registration callbacks are exercised separately by
    all 16 budget cases in the shared isolation matrix, which pass.
  - All 9 budget Playwright flows plus auth setup pass against the production
    build. Synthetic phone/desktop light/dark screenshots are in
    `docs/screenshots/budgets/`.
  - Production build, bundle scan, lint, types, formatting and docs checks pass.
  - Fresh local database accepts all 11 migrations. A separately seeded
    main-schema database upgrades from 10 to 11 with every existing account,
    transaction and category row unchanged. `pnpm db:migrate` was rerun on
    `reeflect_budgets_test` after the changes, as requested; regeneration
    reports no schema drift.
  - Attempted full regressions: 1,477/1,503 unit tests passed; 26 tests and two
    cleanup hooks timed out on blocked Neon storage. Full browser run had
    96/102 pass: five storage-dependent failures and one budget navigation
    assertion race. The race was corrected; the full budget browser suite
    then passed. Full regression gates remain incomplete, not waived.

### What's next

- Restore managed Neon networking, then rerun the complete unit/browser
  regressions and apply `pnpm db:migrate` to the verified production direct
  endpoint before deploying the new route. Production was checked through
  Neon: database `neondb`, 10 migrations, recurring table present, budget
  table absent. No production migration or fixture writes were made.
- Obtain explicit commit/push/PR authorization under [AGENTS.md](../AGENTS.md)
  section 7 before publishing this new feature. Suggested commit:
  `feat(budgets): add complete monthly category budgets`.
- Required CI, CodeQL and teammate review still gate merging. The feature is
  uncommitted, with its complete code/tests/docs available for review.

### Open problems

- The user saved networking changes, but this running environment continues
  to report enforced revision 25 without Neon hosts. Storage HTTPS returns
  proxy 403; the configured TCP proxy refuses connections and its destination
  grants are empty. Tools can inspect but cannot edit that configuration.
- Financial coverage depends on recorded rows and marked transfers. Automatic
  transfer/card-payment pairing is still separate work. Historical actuals
  follow current category rules; saved allocation amounts remain unchanged.

## HO-053: Publish complete budgets feature after checking current main

- **Date:** 2026-10-11 02:34 (EDT)
- **Author:** Muhammad Tahub Khatri with Codex
- **Branch / PR:** `feat/monthly-budgets` / publishing into `main` at the user's request

### What changed

- User explicitly requested resolving all conflicts with main and opening a
  PR. Fetched main again: it remains `8c4a472f5c1e4009d99fd23dae8f47392874f0ae`,
  already included in this branch. `git merge --ff-only origin/main` reports
  up to date; there are no unmerged paths or conflict markers in the feature.
- The earlier handoff append conflict is resolved, preserving main's entries.
  Publish the entire F-09 implementation, tests, generated migration, docs and
  synthetic screenshots together using
  `feat(budgets): add complete monthly category budgets`.
- No application changes were needed after HO-052's successful feature,
  isolation, browser, build and migration checks. Recheck documentation and
  the staged diff before committing; verify GitHub mergeability after opening
  the PR.

### What's next

- Required CI, CodeQL and teammate review must pass before merging. The PR
  description records the completed checks and incomplete full regressions.
- Apply `pnpm db:migrate` to the verified production direct endpoint before
  deploying budgets. Local migration checks passed; production remains pending
  because managed networking blocks its connection.

### Open problems

- Runtime configuration now reports enforced revision 26, but its effective
  allowed hosts still omit Neon. A fresh storage connectivity check returns
  proxy HTTP 403. Full storage-dependent regression checks remain blocked;
  this is not a waived test gate.
