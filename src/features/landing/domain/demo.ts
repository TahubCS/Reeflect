// The landing page's looping product demos: one sample account and the
// timeline every demo follows. Illustrative figures only, never anyone's data.

import { APP_NAME } from "@/config/app";
import {
  type Cents,
  absolute,
  add,
  cents,
  divideFloor,
  formatCents,
  fraction,
  positivePart,
  subtract,
  sum,
} from "@/lib/money";

/** The demos loop over 20 steps of 700ms, so one loop takes 14 seconds. */
export const DEMO_STEPS = 20;
export const STEP_MS = 700;

/**
 * The step rendered on the server, before the clock starts, and for good when
 * the visitor prefers reduced motion: every demo is fully shown.
 */
export const RESTING_STEP = 12;

export function nextStep(step: number): number {
  return (step + 1) % DEMO_STEPS;
}

export const SAMPLE = {
  today: "October 7",
  todayLong: "Wednesday, October 7",
  month: "October 2026",
  payday: "October 15",
  paydayShort: "Oct 15",
  paydayLong: "Thursday, October 15",
  daysToPayday: 8,
  billsBeforePayday: 4,
  balanceToday: cents(46942),
  owedBeforePayday: cents(16588),
} as const;

export const yoursToSpend = subtract(
  SAMPLE.balanceToday,
  SAMPLE.owedBeforePayday,
);

/** Rounded down, so the figure never promises more than there is. */
export const perDay = divideFloor(yoursToSpend, SAMPLE.daysToPayday);

/** The answer the agent texts back, built from the figures above. */
export const STANDING = `You have ${formatCents(SAMPLE.balanceToday)} today, and ${formatCents(SAMPLE.owedBeforePayday)} is owed before payday on ${SAMPLE.paydayShort}. That leaves about ${formatCents(perDay)} a day.`;

// ---- The Today card: entries land one by one and the totals follow ----

export type TodayEntry = {
  name: string;
  note: string;
  amount: Cents;
  /** The step at which the entry lands. */
  arrivesAt: number;
};

const LUNCH: TodayEntry = {
  name: "Lunch",
  note: "Eating out, texted in",
  amount: cents(-1200),
  arrivesAt: 4,
};

export const TODAY_ENTRIES: readonly TodayEntry[] = [
  {
    name: "Thrift shop, cash",
    note: "Shopping, added by you",
    amount: cents(-2799),
    arrivesAt: 2,
  },
  LUNCH,
  {
    name: "A refund",
    note: "Money in, texted in",
    amount: cents(4000),
    arrivesAt: 6,
  },
];

/** Entries clear away together after this step, before the loop restarts. */
const ENTRIES_LEAVE_AFTER = 17;

export function entryShown(entry: TodayEntry, step: number): boolean {
  return step >= entry.arrivesAt && step <= ENTRIES_LEAVE_AFTER;
}

/** The balance before any of today's entries, so the day ends on `balanceToday`. */
const OPENING = subtract(
  SAMPLE.balanceToday,
  sum(TODAY_ENTRIES.map((entry) => entry.amount)),
);

export type TodayTotals = {
  moneyIn: Cents;
  moneyOut: Cents;
  balanceAfter: Cents;
};

/** The Today card's totals once the entries due by `step` have landed. */
export function todayTotals(step: number): TodayTotals {
  const landed = TODAY_ENTRIES.filter((entry) => step >= entry.arrivesAt).map(
    (entry) => entry.amount,
  );
  const moneyIn = sum(landed.map(positivePart));
  return {
    moneyIn,
    moneyOut: subtract(moneyIn, sum(landed)),
    balanceAfter: add(OPENING, sum(landed)),
  };
}

/** Fast, then settles: how the totals slide to their new values. */
export function easeOutCubic(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return 1 - (1 - p) ** 3;
}

/** Part of the way from one amount to another, to the nearest cent. */
export function tween(from: Cents, to: Cents, progress: number): Cents {
  return add(
    from,
    fraction(subtract(to, from), Math.round(progress * 1000), 1000),
  );
}

export function tweenTotals(
  from: TodayTotals,
  to: TodayTotals,
  progress: number,
): TodayTotals {
  return {
    moneyIn: tween(from.moneyIn, to.moneyIn, progress),
    moneyOut: tween(from.moneyOut, to.moneyOut, progress),
    balanceAfter: tween(from.balanceAfter, to.balanceAfter, progress),
  };
}

export function sameTotals(a: TodayTotals, b: TodayTotals): boolean {
  return (
    a.moneyIn === b.moneyIn &&
    a.moneyOut === b.moneyOut &&
    a.balanceAfter === b.balanceAfter
  );
}

// ---- The text conversation ----

export type ChatMessage = {
  from: "app" | "you";
  text: string;
  /** The step at which the message arrives. */
  arrivesAt: number;
};

export const CHAT: readonly ChatMessage[] = [
  {
    from: "app",
    text: `Hi, it's ${APP_NAME}. Tell me what you spent, or ask how you're doing.`,
    arrivesAt: 2,
  },
  { from: "you", text: "spent 12 on lunch", arrivesAt: 3 },
  {
    from: "app",
    text: `Logged ${formatCents(absolute(LUNCH.amount))} for ${LUNCH.name}. ${STANDING}`,
    arrivesAt: 6,
  },
  { from: "you", text: "how am I doing?", arrivesAt: 8 },
  { from: "app", text: STANDING, arrivesAt: 11 },
];

/** The agent "types" for a step or two before each of its replies. */
const TYPING_STEPS = new Set([1, 4, 5, 9, 10]);

export function messageShown(message: ChatMessage, step: number): boolean {
  return step >= message.arrivesAt;
}

export function typingShown(step: number): boolean {
  return TYPING_STEPS.has(step);
}

/** The whole thread fades out at the end of a loop and resets unseen. */
export function threadShown(step: number): boolean {
  return step !== 0 && step < 18;
}

// ---- The hero chart and the pipeline ----

/** The hero's balance line is covered at step 0, then draws itself in. */
export function chartDrawing(step: number): boolean {
  return step !== 0;
}

/** Each of the four pipeline stages lights up for five steps in turn. */
export function litStage(step: number): number {
  return Math.floor(step / 5);
}

// ---- The statement import ----

export type ScannedRow = {
  date: string;
  name: string;
  category: string;
  amount: Cents;
};

export const SCANNED: readonly ScannedRow[] = [
  {
    date: "Sep 02",
    name: "City Water Utility",
    category: "Bills",
    amount: cents(-3840),
  },
  {
    date: "Sep 03",
    name: "Whole Foods Market",
    category: "Groceries",
    amount: cents(-9216),
  },
  {
    date: "Sep 05",
    name: "Direct deposit",
    category: "Income",
    amount: cents(206000),
  },
];
