# SYNTHETIC

Synthetic customers for building and testing Reeflect (ADR-049). Read this
before asking an agent for a batch, or when you are the agent writing one.

**The agent decides who the people are. Code decides what happens to their
money each day.**

1. An agent writes a **population spec** (JSON) by following the rules
   below: one entry per person with their persona, income, bills,
   subscriptions, card and spending habits.
2. The **generator** (`src/features/synthetic`) expands the spec and a seed
   into accounts and transactions: integer cents, account-holder signs
   (ADR-008), paired transfers (ADR-020), exact dates. Same spec + same seed
   + same `GENERATOR_VERSION` = the same rows on any database.
3. The **batch scripts** load the rows into a database as ordinary
   workspaces, each marked with a `synthetic_workspace` row that names its
   batch. A batch can be reported on, deleted, or replayed elsewhere as a
   unit.

Synthetic data never counts toward real users' figures. Anything shown from
it is labelled "Sample".

---

## Workflow

| Step | Command |
|---|---|
| 1. Check which database you are on | `pnpm db:whoami --target branch` |
| 2. Write or ask for a spec | Save it as `scripts/batch/specs/<short-name>.json` |
| 3. Preview it: people, totals per persona, checks | `pnpm batch load <spec.json> --dry-run` |
| 4. Load it on the batch-testing branch | `pnpm batch load <spec.json> --seed <anything>` |
| 5. Review | `pnpm batch list`, `pnpm batch report <batchId>` |
| 6a. Keep it: replay into production | `pnpm batch promote <batchId> --target production --yes` |
| 6b. Drop it | `pnpm batch delete <batchId> --yes` |

- **The default target is the batch-testing branch.** Every command prints
  the database's endpoint id (`ep-…`) before it does anything.
- **Production writes are guarded.** They need `--target production`, `--yes`, and
  `NEON_PRODUCTION_ENDPOINT_ID` in `.env.local` matching the production URL.
- **A batch is a recipe**, so promoting replays it. The `synthetic_batch`
  row stores the spec (including its `asOf` date), the seed and the
  generator version. Neon branches cannot be merged (ARCH-10), so `promote`
  replays the recipe into production and checks that the generator version
  matches.
- **No seed given** means `load` picks one at random and records it.
- **`--as-of YYYY-MM-DD`** stops generation on that day; the default is
  today. Nothing after `asOf` is ever generated.
- **Viewing a batch in the app** needs a signed-in member, and synthetic
  workspaces have none yet. Until a developer viewer exists, use
  `batch report`, or query the branch in the Neon SQL editor.

### Databases

| Target | Database | Variable in `.env.local` |
|---|---|---|
| `branch` (default) | The Neon batch-testing branch, a child of production | `DATABASE_URL_BATCHTESTINGBRANCH` (pooled is fine; scripts connect directly) |
| `production` | Neon production | `DATABASE_URL_UNPOOLED`, checked against `NEON_PRODUCTION_ENDPOINT_ID` |
| `local` | Docker (`docker compose up -d`) | none |
| `app` (`db:whoami` only) | Whatever `DATABASE_URL` points at, which is what `pnpm dev` uses | `DATABASE_URL` |

When production gets a new migration, migrate the branch too:
`pnpm db:migrate:to branch`. Or reset the branch from its parent in the Neon
Console and reload the batches you want, since they are recipes.

---

## Rules for the agent writing a spec

1. **Output exactly one JSON spec** matching `src/features/synthetic/domain/spec.ts`
   (the zod schema is the source of truth). Start from
   [the example spec](../tests/fixtures/synthetic/example-spec.json). Every
   amount is **integer cents and positive**, except `openingBalanceCents`
   (a card's is zero or negative: owed) and event amounts (signed: negative
   = money out). The generator applies all other signs.
2. **Honour the requested mix exactly.** If the request names no mix, use
   the default mix below and say so in `request`.
3. **Copy the developer's request word for word** into `request`. Give the
   batch a short `label`.
4. **Spread people within each persona.** No two people should have the same
   numbers, and include people near both edges of the persona's band.
   Vary pay schedules, rent, bill due days, opening balances and spending
   habits.
5. **Keep each person consistent.** The spec fixes paycheck amount and
   schedule, rent, each bill's due day and each subscription's price and
   day. Variation comes only from `variationPct` (for example utilities
   10–25%, hourly pay 3–8%, gig work 25–45%) and from the spending ranges.
   Never invent per-month numbers.
6. **Stay plausible.** These checks print as warnings:
   - Yearly take-home sits inside the persona's band.
   - Bills plus subscriptions come to less than take-home.
   - Each person has at least 2 recurring bills.
   - Checking never goes below −$100. Give a payday-before-rent person
     enough opening balance to cover the 1st.
   - Spending stays under about 110% of what comes in (pay plus one-off
     money in, such as aid).

   Per-month figures are measured through the last complete month, so a
   span ending today is not skewed by a partial month.

   Fix the spec rather than leaving warnings, unless the request asks for
   that kind of person.
7. **Synthetic only.** Invent every person's name; never use a real person.
   Real merchant and employer-style payer names are fine, for example
   "Harris Teeter" or "SSA TREAS 310 XXSOC SEC". USD only. No investing,
   brokerage or crypto accounts or transactions (AGENTS.md section 2).
8. **Write one `summary` line per person** that a reviewer can scan, with
   the key numbers: "Nurse, biweekly $2,140, rent $1,325, pays the card in
   full."
9. **Write payers and merchants the way a statement would**, with income in
   capitals ("NORTHGATE LOGISTICS PAYROLL"). Use local merchants for North
   Carolina (Food Lion, Harris Teeter, Sheetz, Duke Energy) unless the
   request says otherwise.

### Personas

Take-home is what lands in checking per year, not gross salary. The bands
are rough, from public Census and BLS figures, and live in
`src/features/synthetic/domain/check.ts`.

| Persona (`persona`) | Take-home per year | Pay (`schedule`) | Typical traits |
|---|---|---|---|
| `paycheck_to_paycheck` | $15k–$34k | `two_weeks` or `week` | Rent is a large share; small buffer; carries a card balance and pays the minimum; close to $0 before payday |
| `hourly_gig` | $16k–$42k | `irregular`, or `week` with high `variationPct` | Uneven deposits and uneven spending |
| `student` | $3k–$18k | Part-time `two_weeks` plus aid as `events` | Low fixed costs; many small purchases; often no card |
| `salaried_middle` | $40k–$78k | `two_weeks` or `half_month` | Steady bills; some monthly savings |
| `upper_middle_tech` | $75k–$175k | `half_month` | High rent or mortgage; many subscriptions; most spending on the card, paid in full; saves monthly |
| `retiree` | $22k–$80k | `month_weekday` (Social Security) plus `month` (pension) | Healthcare and travel spending; very stable bills; large savings |
| `single_parent` | $25k–$58k | `two_weeks` | Childcare bill; heavy groceries; `Kids` spending |

**Default mix for 50 people:** 12 paycheck-to-paycheck, 6 hourly/gig,
5 students, 12 salaried middle, 6 upper-middle tech, 5 retirees, 4 single
parents. Scale it for other sizes.

### Spec reference

| Field | Meaning |
|---|---|
| `version` | Always `1` |
| `startMonth`, `months` | First month (`YYYY-MM`) and how many months (1–36) |
| `asOf` | Optional last day to generate; the loader fills in today |
| `people[].key` | Short unique slug, for example `p2p-07` |
| `accounts.checking` | Opening balance |
| `accounts.savings` | Opening balance, `monthlyTransferCents` from checking (0 for none), `transferDay` |
| `accounts.card` | Opening balance (≤ 0), `aprBps` (2499 = 24.99%), `payment` (`full`, `minimum` = larger of $25 and 2%, or `fixed`), `paymentDay` |
| `income[]` | `payer`, `amountCents` per deposit, `variationPct`, `schedule` |
| `schedule.every` | `week` (`weekday`, 0 = Sunday), `two_weeks` (`anchor` date), `half_month` (`days`, e.g. `[15, 31]`), `month` (`day`), `month_weekday` (`nth`, `weekday`), `irregular` (`perMonth` range) |
| `bills[]` | `name`, `amountCents`, `day` (29–31 fall on the last day of short months), `category`, `account`, `variationPct`, `cadence` (`monthly` or `yearly` with `month`) |
| `subscriptions[]` | As bills, without `category` |
| `spending[]` | `category`, `merchants`, `perMonth` range, `amountCents` range, `cardShare` (percent on the card) |
| `events[]` | One-offs: `date`, `description`, signed `amountCents`, `account`, `category` |

How the generator behaves:
- **Paydays** that fall on a weekend move back to the Friday before.
- **Bills and subscriptions** post on their due day.
- **Card statements** close on the last day of each month. The payment, on
  `paymentDay` of the next month, is a transfer pair from checking. Interest
  is charged at month end on whatever was carried over.
- **Savings transfers** are transfer pairs too.

---

## Later

- **Nessie demo customers** use the same spec format in whole-dollar mode
  (`wholeDollars`), because Nessie drops cents (ADR-048). They arrive with
  `pnpm db:seed` (F-21).
- **Statement fixtures** (TEST-08) will be rendered from the same expansion.
- **The insights page** will read synthetic workspaces only, with a minimum
  group size, behind its own ADR.
