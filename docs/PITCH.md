# PITCH

What we say to the judges, what we show, and what we must never claim.
Every claim here must be true of the build we demo. Unfinished features are
shown as previews and described as previews (ADR-027).

Product name: **Reeflect** (ADR-002). Tracks: Beginner/General, Photon AI
Agent Track, Best Use of Nessie with Capital One, MLH Best Use of Gemini API
(ADR-036).

> **Updated 2026-10-07 (ADR-042):** the aquarium is replaced by a cash-flow
> calendar. The week-ahead image and the exact reply wording are still
> Proposed; the agent, Nessie and trust story are unchanged.

> **Updated 2026-10-10 (ADR-043, ADR-044):** statement parsing (CSV and PDF,
> by code) is now one of the four main features. The demo script in section 5
> does not show a statement upload yet; add a step once the import works.

> **Updated 2026-10-11 (HO-048):** the website calendar now runs on the
> workspace's own accounts and transactions; the sample data and the chat
> simulator are gone. The calendar does not read recurring payments (F-10,
> ADR-058) yet, so paydays, bills and subscriptions still to come are not
> on it. Until then the
> headline shows today's balance, not the per-day amount, and the 1:00 step
> must not say that upcoming paydays and bills are on the calendar.

---

> **F-09 on the budgets branch (ADR-060):** after its migration and deployment,
> an optional website demonstration can set a $500 groceries plan and show
> $320 of recorded net spending with $180 remaining. Editing or copying
> allocations leaves account balances and transactions intact. This page
> does not calculate cash available until payday, and budget replies by text
> remain F-27/F-28 work.

## 1. One line

> **"Reeflect lives in your texts. Ask how you're doing and it tells you
> what you can spend each day until payday and what's coming, with numbers
> you can trust."**

## 2. Thirty-second version

> "Most people can't answer a simple question: how am I doing with money this
> month? Budgeting apps try, but they're one more app nobody opens. Reeflect
> lives where you already are: your texts. Ask it how you're doing and it
> replies with one plain number: what you can spend each day until payday,
> after the bills already on their way. On the web, your month is a calendar
> of paydays, bills, subscriptions and spending. It warns you before your car
> payment is due, flags new subscriptions, and logs spending you text it.
> And every number comes from your real account data, never from the AI."

## 3. The problem

| Problem | One sentence for the judges |
|---|---|
| Nobody opens budgeting apps | "Budgeting tools are another app to remember, so people stop opening them." |
| Hard to read | "When they do open them, they get charts and tables, not an answer." |
| Backward-looking | "They tell you what you already spent, not that your car payment is due in a week and your balance won't cover it." |
| Trust | "AI tools are great at sounding confident and bad at getting numbers right." |

## 4. What we built differently

| Edge | What the judges see | How it works | Doc |
|---|---|---|---|
| **Lives in iMessage** | A judge texts Reeflect from their own phone and gets an answer | Photon Spectrum relays messages; Gemini picks tools; our code supplies every number | ADR-031, ADR-032 |
| **Your week in your texts** | A picture of the next 7 days arrives in Messages | Same calendar data as the website, rendered to an image (Proposed) | ARCH-13, ADR-042 |
| **One plain answer** | "You can spend about $X a day until payday", with the sum behind it, above a calendar of the month | Pure functions turn real transactions into the headline and every calendar day | ADR-042 |
| **Ahead of problems** | "Your car payment is due in 7 days, and your balance is lower than the payment" | Bills from Capital One's Nessie data with lender due dates | ADR-030, ADR-033 |
| **Numbers you can trust** | The agent's answers match the dashboard exactly | AI writes words; code inserts numbers; a digit scan blocks invented figures | ADR-019, ADR-035 |

## 5. Demo script (about 3 minutes)

Run on the seeded demo workspace (`pnpm db:seed`, which also creates the demo
Nessie customer). Put the Reeflect iMessage number and a QR code on the
screen. Fill in the bracketed values from the seed before rehearsing.

| Time | Presenter does | Presenter says |
|---|---|---|
| 0:00 | Show a phone home screen full of finance apps (slide) | "How many of these do you actually open? Reeflect doesn't need you to open anything." |
| 0:15 | Text "how am I doing?" on the presenter's phone, mirrored on screen | "I just text it." The reply arrives: balance, what's owed before payday, the per-day amount, and the week-ahead image. |
| 0:40 | Show the "Try it" QR code | "Try it yourself: scan this and hit send." The QR opens Messages with `TRY` already typed. The judge's phone is linked for two hours to its own sandbox workspace with Capital One Nessie data, and Reeflect replies with a welcome and that workspace's summary. Mention: "Normally you link your phone with a one-time code from our website; this shortcut only exists in demo mode." |
| 1:00 | Switch to the website calendar | "The same numbers, as a month. Paydays, bills and subscriptions are already on their days, and the line shows where your balance is heading." |
| 1:20 | In the demo control, create a $90 dining purchase in Capital One's Nessie sandbox; tap "Sync now" | "This is Capital One's Nessie API. Watch today." The purchase appears on today's square and the per-day number drops. |
| 1:45 | Show the subscription alert that arrives in iMessage | "Reeflect noticed a new subscription: [$X] a month, [$Y] a year. I reply 'cancel' to mark it. Reeflect never moves money; it just keeps track." |
| 2:05 | Show the bill reminder in iMessage | "And a week before my car payment, it reminds me, and tells me my balance won't cover it yet." |
| 2:25 | Text "12 lunch" | "Logging cash is one text." Reply confirms the category and what's left. |
| 2:45 | Close | Repeat the one-line pitch (section 1). |

Steps that depend on P1 features (the keep / cancel reply at 1:45, bill
reminders at 2:05) are cut if unfinished (ADR-043).

Optional F-08 demo after the categorization PR and migration are merged:
open Transactions in a seeded workspace, change a merchant to Groceries and
select “Also save a rule”. Show another matching transaction becoming Groceries
automatically. Say: “Correct it once and remember the merchant next time.”
This does not depend on an AI call or change transaction amounts.

Optional F-10 website demo after migration 0009: open **Recurring payments**
with three monthly electricity charges of $95, $130 and $110. Show the
supporting charges and confirm the suggestion: it becomes a variable bill
with a $110 typical payment and a $95–$130 recent range. Say: “We look for
patterns in payment dates, even when the amount changes. You confirm the
pattern; future amounts and dates are estimates.” Add rent manually, or
mark a confirmed streaming subscription planning to cancel and show potential
annual savings. Actual spending comes from posted charges minus matching
credits. This website flow is built; iMessage alerts, scheduled reminders
and a live-data calendar integration remain separate features.

## 6. Judge questions to prepare for

| Likely question | Answer |
|---|---|
| "Isn't this just another budgeting app?" | "It's the opposite: it's budgeting without an app to open. You text it, and it texts you before problems happen." |
| "Why a calendar?" | "People who aren't confident with money don't think in budgets and categories; they think in days until payday. A calendar shows what's coming on the day it comes, and one sentence says what's safe to spend." |
| (Photon) "Why iMessage?" | "That's where people already spend their day. The agent shows up like a contact, so there's nothing new to learn. iMessage is our prototype channel; because Spectrum is cross-channel, WhatsApp and Telegram are the next step with no change to the agent." |
| (Gemini) "How do you use Gemini?" | "Gemini handles the open-ended questions and picks which of our tools to call; our code supplies every number. Simple commands never touch the model, which keeps the agent fast and within limits." |
| (Photon) "What does Spectrum do for you?" | "It handles the iMessage connection, typing indicators, and sending images; our worker just relays, and the brain stays in our Next.js app with the same auth and tests as the website." |
| (Capital One) "How did you use Nessie?" | "Nessie is our live data source: accounts, purchases, deposits, transfers, bills and loans all land on the calendar, and Nessie bills drive the due-date reminders." |
| "How do you stop someone else texting and seeing my data?" | "Your phone has to be linked by texting a one-time code from it, and then you approve that phone on the website. Unlinked numbers get nothing but a sign-up message." |
| "What if the AI gets a number wrong?" | "It can't: the AI chooses which question to ask the database; our code puts the numbers in the reply, and a check blocks any digit the AI made up." |
| "What about privacy on the lock screen?" | "Our alerts never put amounts in the text. The lock screen says your car payment is coming up; the numbers are inside the conversation once you open it." |
| "Can I change when it messages me?" | "Yes: set quiet hours on the website, or just text it, like 'Reeflect, register new quiet hours 11PM to 7 AM'." |
| "How would this make money?" | "Freemium for people, and licensing for banks: a bank could put Reeflect in front of its own customers to keep them on top of their bills." (ADR-028) |
| "What's next?" | "More channels (WhatsApp and Telegram), real bank linking through Plaid, household group chats, and statement uploads." |

## 7. Claims we must never make

| Don't say | Why |
|---|---|
| "The first / only app that…" | Not verified; similar tools exist |
| "Bank-grade", "enterprise-certified", "fully secure" | No audit has been done |
| "AI financial advisor" or any advice | Out of scope (ADR-001) |
| "Reeflect pays your bills" or "cancels your subscriptions" | It never moves money or cancels anything |
| "Connected to your Capital One account" | Nessie is a sandbox with mock data |
| Presenting a preview as a working feature | Judges click around (ADR-027) |
| Anything involving a team member's real accounts | Real data is never shown on stage |

## 8. Track-specific emphasis

| Track | Lead with | Make sure judges see |
|---|---|---|
| Photon AI Agent | "Agents where people already are" | A live iMessage exchange, the typing indicator, the week-ahead image arriving, a proactive alert |
| Best Use of Nessie | Nessie as the live data source | Creating a Nessie purchase and the calendar and per-day number reacting; Nessie bills becoming reminders |
| MLH Best Use of Gemini API | Gemini as the agent's reasoning with function calling | A free-form question answered through tools, with numbers that match the dashboard |
| Beginner/General | The whole story | The one-line pitch and the 3-minute demo |

Devpost write-up: one section per track explaining exactly how Spectrum and
Nessie are used, with screenshots.

## 9. Before going on stage

- [ ] Fresh seed loaded, including the Nessie customer; bracketed values filled in
- [ ] Worker running and connected; a test text answered within 5 seconds
- [ ] Demo phone linked; `DEMO_MODE=true` on the demo deployment; `pnpm demo:judges` run; "Try it" QR code on the slide
- [ ] After judging: `pnpm demo:reset`
- [ ] Proactive alerts prepared so they arrive on cue (demo control)
- [ ] Brightness up, Do Not Disturb on for everything except Messages
- [ ] Backup screen recording of the full demo, including the iMessage parts
- [ ] Each presenter has rehearsed the script twice
