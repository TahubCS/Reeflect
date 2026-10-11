# Database readiness before release

Run `pnpm db:verify --target app|local|branch|production` from the repository
root. It prints the selected endpoint and database without a connection URL,
then checks this checkout's bounded financial-page contract. It does not
repair schema, apply migrations, read financial rows or change `/api/health`.

The contract covers Accounts, Transactions, statement-import references,
Categorization, Recurring payments, Budgets and Bills. Required columns come
from their current Drizzle tables, including transfer flags/pair IDs and Bills
evidence. Workspace/user references are limited to their IDs. Column types
and nullability, valid unconditional uniqueness and validated foreign-key
ownership/reference semantics must match. Constraint names and compatible
additional objects do not matter. This is not a complete database diff or a
validation of every auth, agent or calendar object.

Each required table is checked with a zero-row SELECT of the required columns
under the selected role. Write privileges, row-level-security policies,
defaults, arbitrary check expressions and stored data correctness are not
verified. No INSERT, UPDATE, DELETE or DDL probe runs. Checks use a read-only
repeatable-read transaction, a ten-second connection/client-query timeout,
five-second statement timeout and two-second lock timeout; the client closes
on success and failure. Permission, connection/query and required-schema
failures exit nonzero. A missing or inaccessible migration journal is a
diagnostic warning, as are unrecorded or newer migration timestamps.

For example, 0012 may have recovered `budget` while the original 0010 timestamp
is absent. Compatible schema passes with that journal warning. Conversely,
SELECT 1 and a fully populated journal do not make a missing table ready.
Use `pnpm db:whoami --target <name>` and the migration SQL to investigate;
do not replay migrations or rewrite history based on a warning alone.

## Release sequence

1. Identify the intended database and both runtime/migration connection roles.
   `app` selects `DATABASE_URL`; `production` prefers
   `DATABASE_URL_UNPOOLED`, which may have a more privileged role. Inspect
   the secret-safe target display and use the existing named-target guard
   for authorized production writes (ADR-049).
2. If a migration is needed, apply the reviewed migrations before traffic
   reaches the new app version. Never infer production success from a local
   migration. Migrations continue to require a direct TCP connection.
3. Run `pnpm db:verify --target app` using the intended runtime URL and app
   role. A pass with the migration role alone does not establish app access.
   A read-only check of the named deployment target is useful additionally.
   In this HTTPS-only cloud workspace the verifier can use the user-selected
   `DATABASE_TRANSPORT=websocket`; it honors inherited proxy/CA settings.
4. Release and smoke-test the real financial pages with the intended app
   connection. Preserve any environment-blocked checks in the handoff.

CI's existing unit and E2E PostgreSQL jobs run the verifier after migration
with `--target app`, selecting their service on port 5432. `--target local`
selects Docker's port 5433. These are disposable CI databases, not production
verification. The CLI does not prevent a separate Vercel auto-deployment:
the team's release process must actually run this check before deployment.
No page gate, public endpoint, startup migration or offline-build database
dependency is introduced.

Fault tests create separate local databases. They never remove shared-suite
tables or production objects, and cover healthy SELECT 1 with missing schema,
column/type/nullability faults, ownership/uniqueness, read permissions,
compatible extras, journal discrepancies and command-level secret redaction.
