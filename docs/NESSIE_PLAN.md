# Nessie integration plan

Owner: Jacob Heminway. Branch: `feat/nessie-client-sync`. Status: draft,
2026-10-11. Governing ADRs: ADR-033, ADR-043, ADR-048 (Proposed: accept it,
with the findings in section 2, in the PR that adds the client).

## 1. Goal

Some demo customers have **Nessie as their source of truth**. We write their
history into Nessie once, then the app only ever reads it back. Changing a
record in Nessie and pressing **Sync now** changes the calendar, and the app
can show that the numbers came from Capital One's API rather than our
database.

## 2. What Nessie actually does (measured 2026-10-11)

Probes were run with our key against throwaway accounts on the existing probe
customer. Everything they created was deleted, except the purchases noted
below.

### Rate limits

Nothing is published: the docs pages return 403, there are no rate-limit
headers, and the API sits behind AWS API Gateway. Measured:

| Test | Result |
|---|---|
| 32 GETs at concurrency 1 / 4 / 8 / 16 / 32 | all 200; p50 60-100 ms; up to 166 req/s |
| 24 POST purchases at concurrency 1 / 4 / 8 / 16 | all 201; p50 ~60 ms; up to 118 req/s |
| 900 POST deposits at concurrency 16 / 32 / 64 | all 201; 117 / 195 / 215 req/s |
| 900 DELETE deposits at concurrency 32 | all 200; 410 req/s |
| GET 900 deposits in one list | 0.8 s, 148 KB |

There was **no 429 and no throttling at any level**. Occasional single
requests take ~1 s, which looks like a cold start. We use concurrency 8,
retry with backoff on 429 or 5xx, and treat any 429 as a sign to slow down.

### API behaviour that changes the design

| Finding | Consequence |
|---|---|
| `GET/PUT/DELETE /purchases/{id}` and `/withdrawals/{id}` return 403 "Missing Authentication Token": **those routes do not exist** | Purchases and withdrawals are **append-only**. A demo can't delete one; it posts a refund instead (section 7). |
| `DELETE /deposits/{id}` and `PUT`/`DELETE /bills/{id}` work | Deposits and bills can be undone directly. |
| Deleting an account leaves its purchases readable at `/accounts/{deadId}/purchases` | Sync must start from `GET /customers/{id}/accounts`. An account missing from that list is gone, whatever its child records say. |
| `POST /accounts/{id}/transfers` rejects `medium` and `payee_id` as unknown fields | A transfer can't name the other account. Transfers and card payments are seeded as a **withdrawal plus a deposit** sharing a `xfer:<pairId>` tag in the description (ADR-020). The transfers endpoint goes unused. |
| An empty transfers list returns **404** "No transfers found"; the other lists return `[]` | The client treats 404 on a list as empty. |
| `GET /merchants/{id}/purchases` fails with a server validation error | Never use it. |
| Merchants are scoped to our key (only our probe merchant is listed) | The seed creates its own merchants. |
| From earlier probes: cents are dropped on everything but bills, balances never change, `status` is required, customers can't be deleted | Whole dollars, always send `status`, compute balances ourselves, never create throwaway customers. |

Leftovers from the probes are about 100 orphaned $9-$12 purchases on deleted
accounts of the probe customer. Nothing lists them, and they can't be
deleted.

## 3. Who generates the data

**We do. Nessie generates nothing.** The synthetic generator
(`src/features/synthetic`, `expandSpec(spec, { seed, wholeDollars: true })`)
makes the person, and the seed script posts them to Nessie. The seed never
writes transactions to our database; the first sync does, which proves the
round trip.

## 4. Size and time for one 12-month customer

| Record | Per year |
|---|---|
| Purchases (~10/week) | ~520 |
| Paychecks (deposits) | 26 |
| Bills (recurring definitions) | ~10 |
| Bill payments (withdrawals) | ~120 |
| Transfers and card payments (2 records each) | ~70 |
| **Total** | **~750 records** |

| | Estimate, from the measurements |
|---|---|
| Seed, concurrency 8 | ~750 / ~100 req/s, **about 10 s** (about 50 s sequentially) |
| Size in Nessie | ~170 B per record in list responses, **about 130 KB** |
| Full sync | 3 accounts x 5 lists = **15 GETs, under 2 s**, ~130 KB |

Neither memory nor time is a concern. Seeding all three customers (section
6) takes under a minute.

## 5. Linking a Nessie customer to our database

There is no schema change. Everything needed already exists in
`src/lib/db/schema/finance.ts`:

- `financial_account.source = 'nessie'` and `nessie_account_id` (unique
  per workspace).
- `transaction.source = 'nessie'` and `external_id = <nessie id>`.
- `transaction.fingerprint = 'nessie:<type>:<id>'`. The fingerprint is already
  unique per account (`transaction_account_fingerprint_uidx`), so
  `ON CONFLICT (financial_account_id, fingerprint) DO UPDATE` makes re-sync
  idempotent.
- `import_batch.kind = 'nessie'` would record each sync, but that table
  requires statement fields (CSV object key, period and so on). A sync log is
  better kept in a small `nessie_sync` table. **That is a schema change:
  confirm it first.** The fallback is to keep "last synced" on the account
  (`balance_as_of` plus `updated_at`) and add no new table.

**Linking step** (`pnpm nessie link`):

1. Takes a Nessie customer id and a workspace: the Personal workspace of a
   demo user, found by email, as `batch give` does with
   `findPersonalWorkspace`.
2. Creates one `financial_account` per Nessie account, with institution
   "Capital One (Nessie sandbox)", `source = 'nessie'` and the
   `nessie_account_id` set.
3. Runs the first sync.

The in-app equivalent is ADR-033's "Connect Capital One sandbox" button. It
does the same steps for the customer that belongs to the demo workspace.

## 6. The seed script: `pnpm nessie seed` (also becomes `pnpm db:seed`)

```text
scripts/nessie/
  cli.ts          seed | link | sync | demo <action> | status
  seed.ts         Expansion person -> ordered list of Nessie POSTs
  manifest.ts     reads/writes scripts/nessie/.manifest.json (gitignored)
  demo.ts         live demo actions (section 7)
```

Steps for one customer:

1. Expand one spec person for 12 months: `wholeDollars: true`, a fixed seed,
   `asOf` = today.
2. `POST /customers` with an obviously fake name, such as "Maya Demo
   (synthetic)".
3. `POST /customers/{id}/accounts` x3 (Checking, Savings, Credit Card). Set
   `balance` to the opening balance in whole dollars. Nessie never updates it,
   so it is only a starting point.
4. Create a merchant for each distinct merchant the person uses. This takes
   ~30 calls.
5. Map each generated transaction (`seed.ts`, pure and unit-tested):

   | Generated kind | Nessie record |
   |---|---|
   | card or debit spend | purchase (merchant, `status: "completed"`) |
   | paycheck / income | deposit |
   | bill or subscription charge | withdrawal (description = payee) |
   | transfer / card payment | withdrawal on one account + deposit on the other, `xfer:<pairId>` in both descriptions |
   | recurring bill definitions | bill (`status: "recurring"`, `recurring_date`, `payment_amount` with cents allowed) |

6. POST them at concurrency 8, oldest first.
7. After every success, record the Nessie id against the generated id in the
   manifest. A rerun skips anything already recorded, so a crash midway never
   duplicates.
8. Print the counts and elapsed time. Never print the key or any URL.

Customers can't be deleted, so `seed` refuses to create a second customer
under a name already in the manifest unless `--new` is passed.

**How many customers: three.** One is the main pitch customer. One is "TRY"
for judges to change. One is a spare we switch to by editing the manifest if
another gets messy. Every customer is permanent and visible to other teams
through `/enterprise`, so we don't make more.

## 7. Sync: Nessie in, our rows out

`src/features/nessie/`:

```text
domain/schemas.ts   zod schemas for every Nessie record (unknown fields allowed)
domain/map.ts       Nessie record -> transaction row / recurring bill (pure)
domain/diff.ts      (current rows, fetched records) -> { add, update, remove } (pure)
server/client.ts    fetch + zod + timeout + retry; 404-on-list = []; redacts key
server/sync.ts      syncWorkspace(workspaceId): fetch, diff, apply
server/actions.ts   syncNowAction (requireWorkspaceAccess, editor)
index.ts            exports for the accounts page and the cron route
```

**`syncWorkspace`, for each Nessie-linked account in the workspace:**

1. `GET /customers/{c}/accounts`. Any linked account that is missing has
   been deleted in Nessie, so delete our account and its rows (cascade).
2. `GET` purchases, deposits and withdrawals for each account (5 lists),
   with bills mapped separately.
3. Map them. Amounts go through `fromDollarNumber`. Signs follow the account
   holder's point of view: on a credit card a purchase is negative and a
   deposit (payment) is positive. Rows tagged `xfer:` get `is_transfer` and a
   `transfer_pair_id`.
4. Diff against our `source = 'nessie'` rows for that account by
   `external_id`. **Add** new ids, **update** changed fields, **remove** ids
   no longer in Nessie (a deleted deposit, a deleted account).
5. Apply everything in one database transaction per account. If any Nessie
   call fails, nothing changes and the last good data stays on screen.
6. Recompute `current_balance_cents` = opening balance + sum of rows, and set
   `balance_as_of`.
7. Upsert Nessie bills as confirmed recurring series (`kind: "bill"`,
   `manual: false`), keyed by account + payee. Bills deleted in Nessie are
   removed.
8. Run categorization on new rows the same way imports do. The Nessie
   merchant category is a hint only.
9. Return `{ added, updated, removed, fetched, ms }` for the UI and the
   log. The log records ids and counts only.

**When it runs:**

| Trigger | How | Guard |
|---|---|---|
| **Sync now** button | `syncNowAction` | One sync per workspace at a time (Postgres advisory lock on the workspace id); the button is disabled while it runs |
| Opening the calendar or accounts page | If the last sync is older than 10 min, start one after the response (Next `after()`) and show the cached data | Same lock |
| Periodic | `GET /api/jobs/nessie-sync` checks `Authorization: Bearer $CRON_SECRET`, loops over workspaces that have Nessie accounts, and skips any synced in the last 5 min. Vercel Cron every 15 min. | Same lock; cut this first if time runs short |
| CLI | `pnpm nessie sync --workspace …` | For rehearsal |

## 8. Demo actions and undo

The app stays read-only (AGENTS section 2). Changes are made **in Nessie**,
either by `pnpm nessie demo …` or by a judge with curl, and then synced.

| Demo action | Nessie call | Undo |
|---|---|---|
| "I spent $90 on dinner" | `POST purchase` $90 | Purchases can't be deleted, so post a **refund**: a +$90 deposit tagged `refund:<purchaseId>`. Banks work the same way. Undoing the refund itself is `DELETE /deposits/{id}`. |
| Paycheck arrives early | `POST deposit` | `DELETE /deposits/{id}` |
| New recurring bill | `POST bill` | `DELETE /bills/{id}` |
| Bill price goes up | `PUT /bills/{id}` | `PUT` back |
| Clean slate between judging rounds | Delete the "TRY" customer's scratch credit card account | Sync removes it; `demo reset` recreates an empty scratch account |

Every `demo` command:

- prints the Nessie id and the exact undo command
- appends to the manifest's action log, so `pnpm nessie demo undo-last` works
- sends whole dollars and `status`
- refuses customers not in the manifest
- never calls `DELETE /data`

Rehearsal check, also an `@external` Playwright test: add $90, sync, refund,
sync. The per-day number must return to exactly its starting value.

## 9. Showing judges the source of truth is Nessie

Ordered by impact for the time it takes.

1. **Change it live where they can see it.** A terminal (or Postman) is on
   screen next to the app. Run `pnpm nessie demo purchase 90 "Dinner"`; it
   prints Nessie's own `201` response with the new `_id`. Press Sync now, and
   the toast says "1 new from Capital One · 0.9 s". The calendar day and the
   per-day number change.
2. **Remove something only Nessie knows about.** Delete the scratch account
   or a bill in Nessie, then sync, and it disappears from the app. Our
   database could not have known to do that on its own.
3. **Provenance on every row.** The transaction detail shows "From Capital
   One sandbox · Nessie id 6ef2…". The account card shows "Capital One
   (Nessie) · last synced 2 min ago · 742 records". The "View in Nessie"
   button goes to a server route that fetches **that record live** from
   Nessie (key stays server-side) and shows the raw JSON next to our row.
   Since `/purchases/{id}` doesn't exist, the route finds the record in the
   account's list.
4. **Count check.** The sync result shows "Nessie: 742 · Reeflect: 742".
5. **Unplug it.** With `NESSIE_API_KEY` set to a bad value on a local build,
   Sync now says "Couldn't reach Capital One; showing data from 10:42". The
   numbers stop changing, which shows the API is the input. This is a
   rehearsal or back-pocket demo only.
6. **Judge's own key (stretch).** Sync takes its key and customer id from env,
   so a judge's sandbox customer can be linked with `pnpm nessie link` in
   about a minute.

Items 1-3 are P0. Item 4 is cheap. Items 5 and 6 are only for when a judge
asks.

## 10. Tests

- **Vitest:**
  - `fromDollarNumber` (TEST-04)
  - `seed.ts` mapping: every kind, transfer pairs, whole dollars, status always set
  - `map.ts`: signs per account type, `xfer:` and `refund:` tags, bills with cents
  - `diff.ts`: add, update, remove, deleted account
  - the client: 404 list becomes `[]`, retry on 5xx and 429, key never in a logged string
- **Authorization:** `syncNowAction` rejects a viewer and a non-member.
- **Integration (local DB, fake client):** sync twice and get the same rows;
  remove one record upstream and that row is gone; the balance is recomputed.
- **Playwright:**
  - Sync now updates "last synced" and the counts (fake client).
  - `@external`: real Nessie round trip on the TRY customer, run nightly only.

## 11. Order of work (today)

1. `fromDollarNumber` + tests. Accept ADR-048 with the section 2 findings.
2. `domain/schemas`, `map`, `diff` + tests. These are pure, so no Nessie is
   needed.
3. `server/client.ts` + tests.
4. `scripts/nessie` seed + manifest. Seed the main customer and time it.
5. `link` + `sync.ts` + `pnpm nessie sync`. First real round trip.
6. Sync now button, last-synced label and provenance on the accounts page.
7. `demo` commands. Rehearse the add, sync, refund, sync loop.
8. Seed the TRY and spare customers.
9. "View in Nessie" raw JSON route.
10. Cron route (cut first).
11. `docs/PITCH.md`, `AGENTS.md` command tables (`pnpm nessie`, `pnpm
    db:seed`), HANDOFF entry.

## Decisions (2026-10-11)

- No sync log table: "last synced" is the Nessie accounts' `updated_at`,
  which every sync rewrites. Linking leaves `balance_as_of` empty, which
  reads as "not synced yet".
- Judges watch; only our `pnpm nessie demo` commands write to Nessie.
- One new customer, "Reeflect Demo" (spec `devs.json`, person `jacob-mid`,
  seed `nessie-demo-1`). Seeded in 7.7 s: 3 accounts, 29 merchants, 412
  records. Its ids are in `scripts/nessie/.manifest.json`, which is gitignored
  and lives on the demo machine.
- Our database holds only the account rows (made by `pnpm nessie link`);
  every transaction on them comes from Nessie through Sync now.
- Nessie bills, the cron and on-page-load sync are left out for now. Sync now
  is the only trigger.
