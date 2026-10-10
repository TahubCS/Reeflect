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
