# Recorded transfer review

Open Transactions → Review transfers at
`/w/[workspaceId]/transactions/transfers` (ADR-066). This classifies recorded
activity; it never moves money or changes account balances.

Choose a specific counterpart and check the confirmation before saving. The
page shows each account, posted date, signed amount and description, plus the
matching reason. Several candidates remain explicitly ambiguous. A match uses
posted transactions no later than today in America/New_York, different owned
accounts, nonzero safe integer cents of equal/opposite value, and no more than
three calendar days between dates. Existing pair IDs exclude candidates.
Individual transfer labels may acquire a relationship without changing flags.

Pairing atomically labels exactly two owned rows. Remove pairing clears only
the relationship and keeps each current transfer label, including mixed legacy
flags. Count as normal activity is a separate confirmed action on a standalone
row. Existing confirmed pairs, individual labels, invalid groups and incomplete
relationships have separate states. Reads never repair old data. Account
cascade deletion can leave an orphan that is explicitly detached here.

Review defaults to 90 inclusive days; select older dates or accounts as needed.
One review spans at most 366 days. Activity pages contain 20 rows, with at most
1,000 pages before refining the date/account scope. Counterparts are looked up
independently of the activity page and include the three-day window padding.
Up to 2,000 candidates are counted completely and paged by 20 in a focused
review. Above that cap, choose a counterpart account; no truncated candidate
list is presented as complete. Legacy groups over 50 rows have no partial
repair action. More than 1,000 accounts fails into the retry boundary.

Every write rechecks expected facts, labels, pair IDs and the precise update
version under the same workspace advisory lock used by Bills, then locks
transaction IDs in order. A repeated identical pair confirmation succeeds
without another update; stale or competing forms fail with retained selection
and a reload instruction. Pairing and standalone labelling change only transfer
metadata and timestamps. Amounts, accounts, dates, statuses, descriptions,
categories, source/import facts and stored balances are preserved.

Paired transactions allow description edits; detach first to change financial
fields or a transfer flag. Transaction deletion retains its existing manual
balance undo and atomically detaches surviving owned members, preserving flags.
A label change affecting allocated Bills evidence is rejected in both the new
review and the original checkbox. Explicitly unlink that evidence in Bills
first. An already-labelled debt payment can gain or lose a relationship without
rewriting its payment snapshot. Viewing requires viewer membership; all writes
require editor or owner membership. Foreign IDs never grant access.

Cashflow keeps recorded liquid transfer amounts in opening and daily balances,
while excluding them from activity totals. Card purchases still count as
spending; repayments do not. Budgets, Insights and recurring use their existing
transfer exclusions; Insights retains its existing saving-category semantics.
There is no new importer, worker, agent protocol, dashboard UI or schema change.
