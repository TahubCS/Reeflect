# PROJECT: Reeflect

What the product is, who it serves, what it does, and what it will never do.
Decisions cited as ADR-xxx live in `DECISIONS.md`.

**Accepted** means confirmed by the team. **Proposed** means recommended and
awaiting confirmation: follow it, but confirm before work that is expensive
to reverse.

---

## 1. Summary

**Reeflect lives in your texts; the calendar shows what's coming.**

Reeflect is personal finance for everyday people, with two faces:

| Face | What it is |
|---|---|
| **iMessage agent** (ADR-031) | The everyday interface. Text "how am I doing?" and get your numbers plus a picture of your week ahead. It alerts you to new subscriptions, reminds you of bills, and logs spending you text it. |
| **Web app** (ADR-042) | The full view: a cash-flow calendar that shows what you can spend per day and what is coming, plus accounts, budgets, imports, settings and phone linking. |

Data comes from Capital One's Nessie sandbox (the demo source), manual entry
and CSV exports; Plaid and PDF statements come later.

- Product name: **Reeflect** (ADR-002). Code uses `APP_NAME`.
- Event: HackNC 2026, October 9–11, 2026, a 24-hour build.
- Goal: an MVP clean enough to keep building after the hackathon.
- Tracks: Beginner/General, Photon AI Agent, Best Use of Nessie with Capital
  One, MLH Best Use of Gemini API (ADR-036).

## 2. The problem

| Problem | Why existing tools fall short |
|---|---|
| People have no quick sense of where they stand | Bank and budgeting apps show charts and tables that take effort to read, so people stop opening them |
| Money is spread across several banks and cards | A bank's own budgeting tool only sees that bank's accounts |
| Households share money across people and banks | Most tools are built around one login and one person |
| Many people won't link bank logins to a new app | Most budgeting apps need linking to be useful |
| Budgeting views look backwards | They show what you spent, not whether you will make it to payday |
| Another app is another thing to open | People already live in their messaging apps |

## 3. Who it's for

| Persona | Situation | What they need |
|---|---|---|
| Early-career individual | One or two bank accounts and a credit card; finds budgeting apps tedious | One plain answer they can get without opening an app |
| Household (couple, roommates, family) | Shared bills and separate accounts at different banks | One shared calendar, with each member's personal accounts private unless shared |
| Cautious user | Won't link bank logins to a startup | Full value from uploading statements or CSVs instead |

## 4. Positioning

Budgeting is a crowded space. Reeflect competes on five things together:

1. **Where people already are.** It works inside iMessage; no new app habit
   is needed (ADR-031).
2. **A plain answer.** One sentence says what you can spend per day until
   payday, with the sum behind it (ADR-042).
3. **Forward-looking.** The calendar shows what is coming; bill reminders and
   the expected balance line answer "will I make it?" (F-14, F-22).
4. **Works without linking a bank.** CSV and PDF imports give full value;
   bank linking is optional (F-05, F-06, F-07).
5. **Trustworthy numbers.** Imports are reconciled, every figure traces to
   its source, and AI never invents a number (ADR-010, ADR-019).

Pitch line: *"Reeflect lives in your texts. Ask how you're doing and it tells
you what you can spend each day until payday and what's coming, with numbers
you can trust."* The full pitch, demo script and judge Q&A are in `PITCH.md`.

## 5. Feature catalogue

**P0** = required for the demo path. **P1** = build after all P0 work passes
CI. **P2** = only if time remains. **Preview** = shown as a frontend preview
with sample data (ADR-027); any P1 or P2 feature not built in time becomes one
too. Priorities follow ADR-037, which is Proposed: the team confirms them at
kickoff. Lanes: A = Data, B = Web, C = Agent.

| ID | Feature | Priority | Lane | Description | ADRs |
|---|---|---|---|---|---|
| F-01 | Sign up / sign in | P0 | B | Email and password through Better Auth. Google sign-in is P2. | ADR-006 |
| F-02 | Workspaces | P0 (personal), Preview (household) | B | Every user gets a Personal workspace. Household workspaces with invite links and owner / editor / viewer roles are a preview unless time allows. | ADR-007 |
| F-03 | Financial accounts | P0 | A | Checking, savings, credit-card and loan accounts: institution, type, nickname, last 4 digits. | ADR-009 |
| F-04 | Manual transactions | P0 | A | Add, edit and delete a transaction on an account. | ADR-008 |
| F-05 | CSV import | P0 | A | Upload a CSV to a chosen account, map columns once per institution, preview, pass guardrails, commit. | ADR-009, ADR-010 |
| F-06 | PDF statement import | Preview | A | Text-based PDF statements with identity check and reconciliation. | ADR-010, ADR-011 |
| F-07 | Bank linking (Plaid) | P1 | A | Link accounts through Plaid Link (Sandbox) and sync transactions. | ADR-012 |
| F-08 | Categorization | P0 | A | Keyword rules on the normalized merchant name, with a manual override that can be saved as a rule. | ADR-013 |
| F-09 | Monthly budgets | P0 | A | One budget per category per calendar month; 6–8 preset categories, renameable. Own page, not the home screen. | ADR-015 |
| F-10 | Subscriptions | P0 | A | Detect recurring charges; show monthly and yearly cost; the user marks keep or planning to cancel. The app never cancels anything. | ADR-014, ADR-030 |
| F-11 | Savings goal | P1 | B | One active goal with target amount and date, shown as a progress line on the home screen. | ADR-042 |
| F-12 | Calendar home screen | P0 | B | The per-day headline with its sum, the month calendar, the balance line and the selected-day panel, plus an "Upcoming bills" list once F-22 exists. | ADR-042 |
| F-13 | Drill-down | P0 | B | Select a day to see its activity, sources and balance; filter by kind; switch between calendar and list. | ADR-042 |
| F-14 | End-of-month forecast | P1 | A | The dotted part of the balance line, from recurring income, bills and spending pace. | ADR-026 |
| F-15 | AI insights on the website | P2 | C | Category suggestions and "Ask Reeflect" on the web, reusing the agent brain. | ADR-019 |
| F-16 | Debt and credit tab | Preview | B | Cards and loans (Nessie loans or Plaid Liabilities). Any credit score is labelled "Sample". | ADR-024 |
| F-17 | Monthly recap | Preview | B | Animated playback of the month on the calendar. | ADR-042 |
| F-18 | Themes and accessibility | P0 | B | Light and dark themes, WCAG 2.2 AA, reduced motion, text labels, responsive from 360px. | ADR-018 |
| F-19 | Delete data | P0 | B | Delete a workspace or an account and all its data. | ADR-025 |
| F-20 | Audit log | P1 | A | Security-relevant events, including phone linking and unlinking. | ADR-025 |
| F-21 | Demo seed | P0 | A | `pnpm db:seed` builds the demo workspace, including its Nessie customer and history. | ADR-033 |
| F-22 | Bill due-date reminders | P1 | A + C | Remind 7 days before car payments, mortgage, rent, loans and card minimums are due; low-balance warning; no reminder if already paid. In-app and by iMessage. | ADR-030, ADR-038 |
| F-23 | Nessie import and sync | P0 | A | "Connect Capital One sandbox" creates a Nessie customer and accounts; sync maps purchases, deposits, withdrawals, transfers, bills and loans. | ADR-033 |
| F-24 | Phone linking | P0 | C | Link an iPhone by texting a one-time code; unlink on the website or by texting STOP; opt in to proactive messages. | ADR-034, ADR-038 |
| F-25 | "How am I doing?" | P0 | C | The agent replies with balance, what is owed before payday, the per-day amount, and an image of the week ahead (reply contents and image are Proposed). | ADR-031, ADR-035, ADR-042 |
| F-26 | Subscription alerts | P0 | C | When a new subscription is detected, the agent texts that it found one, with the monthly and yearly cost on an image card; the user replies keep or cancel to set the mark. | ADR-031, ADR-038 |
| F-27 | Log spending by text | P0 | C | "12 lunch": code takes the amount from the text, Gemini picks the category, the agent confirms with the category's remaining budget. | ADR-035 |
| F-28 | Category and balance questions | P0 | C | "How much did I spend on food?" answered through tools with exact numbers. | ADR-031, ADR-035 |
| F-29 | Receipt photos | P1 | C | Photo of a receipt becomes a proposed transaction, saved only after the user confirms. | ADR-035 |
| F-30 | Weekly recap text | P1 | C | Sunday evening summary with the week-ahead image. | ADR-038 |
| F-31 | Household group chat | Preview | C | The agent in a family group chat answers about the household calendar only. | ADR-034 |
| F-32 | Agent worker | P0 | C | Long-running Spectrum process on Render that relays messages between iMessage and the Next.js brain. | ADR-032 |
| F-33 | Quiet hours settings | P0 | B + C | Users set quiet hours on the website (Settings → Notifications) or by texting "Reeflect, register new quiet hours 11PM to 7 AM". Default 9 PM–9 AM. | ADR-038 |
| F-34 | Judge demo ("Try it") | P0 | C | Demo mode only: a judge scans a QR code, texts TRY, and is linked for 2 hours to a sandbox judge workspace. | ADR-034 |

## 6. The calendar (summary; full spec in ADR-042)

The home screen is a cash-flow calendar built for people who are not
confident with money.

| Financial data | Where it shows | Status |
|---|---|---|
| Liquid balance today, minus what is due before payday | Headline: what you can spend per day until payday, with the sum behind it | Accepted (formula Proposed) |
| Money in, bills, subscriptions, day-to-day spending | On the day they happen, by name, with a mark shape per kind | Accepted |
| Balance over the month | Balance line: solid so far, dotted for what is expected | Accepted |
| One day's detail and where each item came from | Day panel: bank, added by you, or texted in | Accepted |
| Subscriptions | Monthly and yearly cost; keep / planning to cancel; what cancelling would save in a year | Accepted |
| Days when nothing went out | "No-spend day" mark | Accepted |
| Savings goal | One progress line on the home screen | Proposed |
| Projected month-end balance | Dotted part of the balance line (ADR-026) | Accepted |

## 7. Non-goals

| Not doing | Why |
|---|---|
| Investing, trading, crypto | Different product and audience (ADR-001) |
| Financial advice or product recommendations | Regulatory risk; the app informs, the user decides |
| Moving money, paying bills, cancelling subscriptions | Read-only by design; removes a whole class of risk |
| Storing bank usernames or passwords | Plaid handles bank login (ADR-012) |
| Real credit scores | Needs bureau agreements; mocked and labelled (ADR-024) |
| Non-USD currencies | Out of scope for now (ADR-008) |
| Scanned (image-only) PDF statements | Needs OCR, which adds misread digits (ADR-011) |
| Shame mechanics (alarms, guilt copy, failure states) | Against the product's calm tone (ADR-042) |
| Sending financial data to an unlinked phone number | Identity must be proven first (ADR-034) |
| A general-purpose chatbot | The agent answers about the user's money and Reeflect only (ADR-031) |
| Real customer data in Nessie | Nessie is a shared sandbox (ADR-033) |

## 8. Team

Muhammad Tahub Khatri, Jacob Heminway and Simon Ormond. No one owns a stack
layer. Each person owns their assigned features end to end (UI, server,
tests), working with coding agents. Current assignments are in `HANDOFF.md`.

## 9. Business model

Freemium subscription plus licensing the product to banks and credit unions
(ADR-028). No billing is built for the hackathon.

## 10. Glossary

| Term | Meaning |
|---|---|
| Workspace | A container of financial data with members: Personal or Household |
| Financial account | A bank, card or loan account (not a login account) |
| Liquid balance | Sum of checking and savings balances |
| Payday | The next expected recurring income; the headline counts down to it |
| Per-day amount | What is left of today's balance after everything due before payday, divided by the days until payday (ADR-042) |
| Import batch | One CSV, PDF, Plaid or Nessie sync committed to one account |
| Transfer | Money moving between two accounts in the same workspace, including card payments (ADR-020) |
| Subscription | A detected recurring charge for optional spending such as streaming |
| Bill | A recurring obligation with a due date (car payment, mortgage, rent, loan, card minimum); gets reminders; not a subscription |
| Agent | Reeflect's iMessage interface (Photon Spectrum + Gemini) |
| Worker | The long-running process that connects the agent to Photon (ADR-032) |
| Brain | The Next.js code that decides what the agent says (`src/features/agent/`) |
| Nessie | Capital One's hackathon banking API with mock data (ADR-033) |
| Messaging identity | A verified link between a phone handle and a Reeflect user (ADR-034) |
