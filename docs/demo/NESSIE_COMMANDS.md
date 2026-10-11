# Nessie demo commands

## Running the live Nessie demo

Each command writes to Capital One's Nessie sandbox, not to our database. Press **Sync now** in the app after each one, and the change appears there. Every write prints the customer and account it hit.

**Before you start**

- `NESSIE_API_KEY` is set in `.env.local`.
- The customer has been seeded (`pnpm nessie seed`) and linked to the demo login (`pnpm nessie link`).

**Commands**

| Command | What it does |
|---|---|
| `pnpm nessie customers` | Lists the seeded customers. `*` marks the current one. |
| `pnpm nessie use "Reeflect Demo"` | Later commands act on that customer. `--name "…"` overrides it for one command. |
| `pnpm nessie status` | Lists the customer's accounts with record counts. |
| `pnpm nessie categories` | Lists the keys you can pass to `--category`. |
| `pnpm nessie demo purchase 90 Dinner --category dining` | A purchase on the card. `--account checking` uses another account. |
| `pnpm nessie demo purchase 16 Netflix --category subscriptions --recurring --from 2026-10-11` | A purchase plus a monthly Nessie bill, which shows in the app as a recurring payment starting on that date (default: today). |
| `pnpm nessie demo deposit 1200 Paycheck --category income` | A deposit into checking. |
| `pnpm nessie demo transfer 200 --to card` | Moves money from checking to the card or savings (`--to savings`), so it shows as a card payment or a transfer. Neither counts as spending. |
| `pnpm nessie demo refund [purchaseId]` | Refunds a demo purchase in full: the last one not yet refunded, or the id you give. |
| `pnpm nessie demo undo` | Reverses the last demo action (see below). |
| `pnpm nessie demo list` | Lists the demo actions and their Nessie ids, oldest first. |

**What `undo` does**

Nessie can't delete purchases or withdrawals, so undoing one adds a refund or a reverse transfer that stays visible.

| Last action | Undo |
|---|---|
| Purchase | Posts a refund. If the purchase was recurring, it also deletes the monthly bill. |
| Deposit or refund | Deletes it. |
| Transfer | Posts a reverse transfer. |

**Things to know**

- **Whole dollars:** Nessie drops cents, so amounts are sent as whole dollars (bills keep cents).
- **Categories:** `--category` sets the category after sync, but never overrides one the user set by hand.
- **Subscriptions:** a recurring bill tagged `subscriptions` or `entertainment` shows as a subscription; any other category shows as a bill.
- **Mistakes are caught first:** a bad category, a bad date or a missing `--to` stops the command before anything is written.
- **Deleting bills:** deleting a bill in Nessie removes its recurring payment at the next sync. On a Nessie account, the sync also removes any recurring payment someone entered by hand in the app.
- **A second customer:** to make the customer list look less staged, seed another with `pnpm nessie seed <spec> --person <key> --name "Maya Demo"`. It doesn't need to be linked.

**Suggested run:** `customers` → `use "Reeflect Demo"` → Sync now → `demo purchase … --recurring` → Sync now → `demo undo` → Sync now.

Full design: `docs/NESSIE_PLAN.md`.
