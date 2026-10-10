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
| Scaffold (Next.js, pnpm workspace, Drizzle, Better Auth, CI, lefthook) | All | Unassigned | — | In progress: Next.js, CI and Drizzle done (HO-017); Better Auth next |
| F-01 Sign up / sign in | B | Unassigned | — | Pages and API done (HO-018, HO-020); personal workspace on sign-up still to do |
| F-02 Personal workspace | B | Unassigned | — | Not started |
| F-03 Financial accounts | A | Unassigned | — | Not started |
| F-04 Manual transactions | A | Unassigned | — | Not started |
| F-05 CSV import | A | Unassigned | — | Not started |
| F-06 PDF statement import (P0, ADR-044) | A | Unassigned | — | Not started |
| F-08 Categorization | A | Unassigned | — | Not started |
| F-09 Monthly budgets (P1) | A | Unassigned | — | Not started |
| F-10 Subscriptions (detection P0, marks P1) | A | Unassigned | — | Not started |
| F-12 Calendar home screen | B | Unassigned | — | Scaffolded on sample data (HO-019) |
| F-13 Drill-down | B | Unassigned | — | Scaffolded on sample data (HO-019) |
| F-18 Themes and accessibility | B | Unassigned | — | Not started |
| F-19 Delete data | B | Unassigned | — | Not started |
| F-21 Demo seed (incl. Nessie) | A | Unassigned | — | Not started |
| F-23 Nessie import and sync | A | Unassigned | — | Not started |
| F-24 Phone linking | C | Unassigned | — | Not started |
| F-25 "How am I doing?" + week-ahead image | C | Unassigned | — | Not started |
| F-26 Subscription alerts | C | Unassigned | — | Not started |
| F-27 Log spending by text | C | Unassigned | — | Not started |
| F-28 Category and balance questions | C | Unassigned | — | Not started |
| F-32 Agent worker | C | Unassigned | — | Not started |
| F-22 Bill reminders (P1) | A + C | Unassigned | — | Not started |
| F-15 Gemini summary on the website (P1, ADR-045) | C | Unassigned | — | Not started |
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

## HO-021: Signed-in header with a navbar; a placeholder page per feature

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
- The open problems in HO-020 still stand.

---

## HO-022: Signed-in header stays on screen and is larger

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
- The open problems in HO-021 still stand.

