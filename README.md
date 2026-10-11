# Reeflect

Personal finance for everyday people. It lives in your texts; the calendar
shows what's coming. Built for HackNC 2026.

- **Coding agents and contributors:** read [AGENTS.md](AGENTS.md) first. It
  holds the rules, commands and project layout, and points to the detailed
  docs in [docs/](docs/).
- **What the product is:** [docs/PROJECT.md](docs/PROJECT.md).
- **Where work stands:** the latest entry in
  [docs/HANDOFF.md](docs/HANDOFF.md).

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
