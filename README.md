# Reeflect

Personal finance for everyday people. It lives in your texts; the calendar
shows what's coming. Built for HackNC 2026 by Muhammad Tahub Khatri, Jacob
Heminway and Simon Ormond.

- **Coding agents and contributors:** read [AGENTS.md](AGENTS.md) first. It
  holds the rules, commands and project layout, and points to the detailed
  docs in [docs/](docs/).
- **What the product is:** [docs/PROJECT.md](docs/PROJECT.md).
- **Where work stands:** the latest entry in
  [docs/HANDOFF.md](docs/HANDOFF.md).

## What it does

**Over iMessage**, you text Reeflect:

- **"How am I doing?"** It replies with your balance, what's owed before
  your next payday, and what you can spend per day until then. These are the
  same figures the website shows.
- **"12 lunch"** logs the spending. The reply says what's left in that
  category's budget.
- **"How much did I spend on food?"** It answers with exact figures from
  your data.
- **Receipt photos** become a proposed transaction, saved only when you
  confirm it. This is off unless `AGENT_RECEIPT_PHOTOS` is `on`.
- **Subscription alerts and bill reminders** arrive on their own, with no
  amounts on the lock screen. Reply DETAILS to see the numbers.
- **Quiet hours** can be set on the website or by text.

**On the web**, a cash-flow calendar shows paydays, bills, subscriptions and
spending on the days they happen, with a balance line and a per-day spending
headline. There are also pages for accounts, CSV and PDF statement imports,
Capital One Nessie sync, budgets, recurring payments, bills, planned
transactions and transfer review.

Reeflect never moves money, never gives investment advice, and never shows
a number produced by an AI model.

## How it works

```text
iPhone ⇄ iMessage ⇄ Photon Spectrum ⇄ agent-worker (Render)
                                          │  relays only, no business logic
                                          ▼
                     Next.js app (Vercel): /api/agent/turn, the website
                          │            │              │
                    Postgres (Neon)  Gemini API   Capital One Nessie
```

- **The worker** ([agent-worker/](agent-worker/)) keeps a Spectrum
  connection open and passes each text to the app. It never touches the
  database, Nessie or Gemini.
- **The app** decides what to do with each text, looks up figures in code,
  and asks Gemini only for words. Gemini gets placeholder labels such as
  `{cash_total}`, never amounts. Code fills in the real values, and a
  digit scan rejects any number the model wrote itself (ADR-019, ADR-059).
- **Statements** are parsed by code, never by AI: CSV, and text-based
  Capital One PDFs through a template. Every import goes through an identity
  check, duplicate detection and balance reconciliation (ADR-010, ADR-044).
- **Money** is stored and calculated as integer cents through
  [src/lib/money](src/lib/money).

Design decisions are recorded as ADRs in
[docs/DECISIONS.md](docs/DECISIONS.md).

## Getting started

Uses pnpm only.

```bash
pnpm install
cp .env.example .env.local   # then fill it in; see the comments in the file
docker compose up -d         # local PostgreSQL on port 5433, used by tests
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. Every command is listed in AGENTS.md section 5.

In a cloud workspace that allows HTTPS but cannot reach PostgreSQL over TCP,
set `DATABASE_TRANSPORT=websocket` in `.env.local`. The app then uses Neon's
WebSocket Pool; deployments still use `pg` when this variable is empty. The
WebSocket and storage clients honor the runtime's `HTTPS_PROXY` and `NO_PROXY`
settings on Node 24.5 or later. Migrations still use a direct TCP connection.

Local statement imports need the five storage variables in `.env.example`
from the Neon `storage-tests` branch. Put them in `.env.local` for the app and
`.env.storage-tests` for tests. Both files are ignored by Git; tests always use
local PostgreSQL and never the production storage bucket.

Before release, run `pnpm db:verify --target app` with the intended runtime
connection role. It checks financial schema and read access without changing
data; a successful health check or migration journal alone is insufficient.
See [database readiness](docs/DATABASE_READINESS.md) for targets, limitations
and the migrate/verify/release sequence.

Review recorded transfers from Transactions → **Review transfers**. Choose a
specific counterpart and confirm the classification; removing a pairing keeps
the existing labels. See [transfer review](docs/TRANSFER_REVIEW.md) for the
window, limits, Bills evidence rules and the separate normal-activity action.

To run the iMessage worker locally (it uses terminal chat by default):

```bash
pnpm --filter agent-worker dev
```

## Attributions

### APIs and services

| Service | What we use it for |
|---|---|
| [Photon Spectrum](https://photon.codes) (`spectrum-ts`) | The iMessage connection: receiving texts and photos, sending replies |
| [Google Gemini API](https://ai.google.dev) (`@google/genai`) | Working out what a text is asking, choosing a category, writing reply sentences, and reading receipt photos. It never supplies a number |
| [Capital One Nessie API](https://api.nessieisreal.com) | Sandbox bank data: customers, accounts, purchases, deposits, withdrawals, transfers and bills. Holds synthetic data only |
| [Neon](https://neon.tech) | Hosted Postgres, and object storage for canonical statement CSVs (through the AWS S3 SDK and `files-sdk`) |
| [Resend](https://resend.com) | Account emails |
| [Vercel](https://vercel.com) | Hosting the Next.js app |
| [Render](https://render.com) | Hosting the agent worker |

### Frameworks and libraries

| Library | Use |
|---|---|
| [Next.js](https://nextjs.org) and [React](https://react.dev) | The web app and API routes |
| [TypeScript](https://www.typescriptlang.org) | All code |
| [Drizzle ORM](https://orm.drizzle.team) and [node-postgres](https://node-postgres.com) | Database schema, migrations and queries |
| [Neon serverless driver](https://github.com/neondatabase/serverless) and [ws](https://github.com/websockets/ws) | Optional WebSocket connection to Postgres where TCP is blocked |
| [Better Auth](https://www.better-auth.com) | Sign-up, sign-in and sessions |
| [Zod](https://zod.dev) | Validating every external input and API response |
| [unpdf](https://github.com/unjs/unpdf) | Reading text from PDF statements in memory |
| [pdf-lib](https://pdf-lib.js.org) | Generating synthetic PDF statements for tests |
| [Motion](https://motion.dev) | UI animation, honouring reduced-motion settings |
| [Tailwind CSS](https://tailwindcss.com) | Installed as a fallback only; styling is plain CSS Modules |
| [Vitest](https://vitest.dev) and [Playwright](https://playwright.dev) | Unit and end-to-end tests |
| [ESLint](https://eslint.org) and [Prettier](https://prettier.io) | Linting and formatting |

The full dependency list, with versions, is in [package.json](package.json)
and [agent-worker/package.json](agent-worker/package.json).

### AI and LLM usage

**Inside the product.** Reeflect calls Google Gemini through the official
`@google/genai` SDK. On the deployed app it tries `gemini-3.8-flash`,
`gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash` and
`gemini-3.5-flash-lite`, in that order; in development and tests it uses
`gemini-3.1-flash-lite` (see [src/lib/ai/models.ts](src/lib/ai/models.ts)).
Gemini does these jobs:

- Works out what a text is asking and which lookup to run
- Chooses a category for spending the user logs by text
- Writes reply sentences around placeholders that code fills in
- Reads receipt photos. What it reads is only a proposal: code checks it,
  and nothing is saved until the user confirms

Gemini never parses bank statements and never produces a figure shown to the
user. Until we have a paid key, only sandbox or synthetic data is sent to it.

**Building the product.** We wrote this project with AI coding assistants,
directed and reviewed by the team:

- **Claude Code** (Anthropic, Claude Opus 5.5) wrote and changed most of
  the code, tests and docs. Commits it helped write carry a
  `Co-Authored-By: Claude` trailer.
- **Claude** on claude.ai helped with planning and design discussions.
- **OpenAI Codex** wrote code and docs on some branches.
- **CodeRabbit** reviewed pull requests.

[AGENTS.md](AGENTS.md) holds the rules every agent followed. Each agent
session is logged in [docs/HANDOFF.md](docs/HANDOFF.md), with who did the
work and which agent helped. Every change went through tests and CI, and
merging into `main` needed a teammate's review.

### Data

All financial data in this repository, in the demo and in Nessie is
synthetic. It comes from our own generator ([docs/SYNTHETIC.md](docs/SYNTHETIC.md));
no real customer data is used.
