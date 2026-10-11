# Bills on the web

`/w/[workspaceId]/bills` tracks invoices independently of the recurring
estimate. It reads confirmed recurring bills, supports manual bills without
history, and offers Upcoming, Due soon, Needs review, History and Stopped views.
This feature sends no messages and initiates no payments.

An electricity estimate of $145 does not establish an invoice amount. Enter
this month's $184 invoice and explicitly link a posted $100 payment to show
$84 remaining. Next month's estimate remains independent. Blank invoice
amount means unknown; zero means no payment due.

Schedules stay in `recurring_series`. `bill_details` preserves the schedule
anchor and optional autopay/debt annotations. `bill_cycle` stores only invoices
the user has touched, keyed by their original scheduled date. Moving a due
date changes that invoice, preserving January 31 → February 28/29 → March 31.
Reads project at most 90 days and never invent past unpaid predictions. Dates
use the app's America/New_York boundary. User dates say **Due**; inferred dates
say **Expected around**.

`bill_payment` assigns one whole posted transaction to one invoice. Linking
requires user confirmation and the same workspace, payment account, normalized
payee and neighboring-cycle window. Pending/future rows and credits cannot
settle invoices. Variable amounts have no fixed matching band. Outgoing marked
transfers qualify only for explicitly configured debt bills; transfer flags
and financial activity remain unchanged. Split allocation is not supported.

Evidence snapshots are checked against the current transaction on every read.
Changed/deleted evidence contributes no payment amount and requires review.
A nullable composite ownership FK preserves the review record after deletion;
unlinking releases its allocation. A manual paid mark is clearly separate from
posted evidence and can be undone. Changing the invoice amount/date clears an
old manual mark. Tracking stop/restore preserves history; changing recurring
kind keeps existing history in Stopped. Account/workspace deletion cascades.

Cash comparison covers checking/savings-funded open invoices over the next
30 days plus unresolved user-dated past invoices. It separates known amounts
from estimates and shows balance dates. Card purchases, everyday spending and
one-off plans are outside it. Account filters show that account's coverage;
the comparison is not a guarantee that a payment will succeed.

## Public API and ownership

- `@/features/bills`: `loadBills`, authorized Server Actions, `BillsPage`, and
  workspace-scoped repositories (`readBills`, `saveBill`, `saveInvoice`,
  `linkBillPayment`, `unlinkBillPayment`, `markBillPaid`). Repository callers
  must authorize the workspace first; website entries enforce viewer/editor
  roles before parsing or reading data.
- `@/features/bills/client`: pure links, form types and cycle types/helpers.
- Recurring's additive `savePaymentInTransaction` is used only inside an owned
  transaction holding the existing workspace advisory lock. Its optional read
  executor allows schedules and invoice facts to share a repeatable snapshot.
  Existing recurring callers keep their signatures and behavior. Optional
  lifecycle kind guards prevent Bills controls from changing a non-bill.

Bill/first-invoice creation is atomic with the canonical recurring schedule.
Cycle edits and links use optimistic revisions and the same workspace lock;
stale forms cannot overwrite a newer change. Business refusals roll back
before returning a readable error. Writes never alter ledger rows or balances.

Limits: 1,000 recurring series/accounts/details, 5,000 stored cycles and 10,000
payment links per workspace. Writes refuse new history at the limit; reads
fail into a retry boundary rather than presenting partial totals. Existing
recurring analysis retains its 20,000-row/three-year bound. Cards, history and
candidate transactions paginate by 20. Candidate pages may be empty when the
underlying rows have other normalized payees; the next page remains available.

Migration `0014_bills_web` is additive. It creates ownership indexes before
foreign keys, and adds a unique workspace/transaction index without rewriting
financial rows. Apply it to the same database used by the deployment before
deploying Bills. Use `pnpm db:whoami` for a secret-free target check and run
`pnpm db:migrate` after the final changes, as requested by the user.

Domain/forms, real PostgreSQL, authorization matrix and Playwright tests cover
the web flow. Dashboard invoice synchronization and every agent/reminder/job
integration remain separate work (ADR-063).
