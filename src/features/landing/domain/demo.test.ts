import { describe, expect, it } from "vitest";
import { cents, formatCents } from "@/lib/money";
import {
  CHAT,
  DEMO_STEPS,
  RESTING_STEP,
  SAMPLE,
  STANDING,
  TODAY_ENTRIES,
  chartDrawing,
  easeOutCubic,
  entryShown,
  litStage,
  messageShown,
  nextStep,
  perDay,
  sameTotals,
  threadShown,
  todayTotals,
  tween,
  tweenTotals,
  typingShown,
  yoursToSpend,
} from "./demo";

describe("the sample account", () => {
  it("adds up: today's balance less what is owed, shared over the days left", () => {
    expect(yoursToSpend).toBe(30354);
    expect(perDay).toBe(3794);
    expect(STANDING).toBe(
      "You have $469.42 today, and $165.88 is owed before payday on Oct 15. That leaves about $37.94 a day.",
    );
  });
});

describe("the demo clock", () => {
  it("steps forward and wraps round at the end of a loop", () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(DEMO_STEPS - 1)).toBe(0);
  });

  it("rests on a step where every demo is fully shown", () => {
    expect(
      TODAY_ENTRIES.every((entry) => entryShown(entry, RESTING_STEP)),
    ).toBe(true);
    expect(CHAT.every((message) => messageShown(message, RESTING_STEP))).toBe(
      true,
    );
    expect(typingShown(RESTING_STEP)).toBe(false);
    expect(threadShown(RESTING_STEP)).toBe(true);
    expect(chartDrawing(RESTING_STEP)).toBe(true);
  });
});

describe("todayTotals", () => {
  it("starts the day with nothing in or out", () => {
    expect(todayTotals(0)).toEqual({
      moneyIn: 0,
      moneyOut: 0,
      balanceAfter: 46941,
    });
  });

  it("follows each entry as it lands", () => {
    expect(todayTotals(2)).toEqual({
      moneyIn: 0,
      moneyOut: 2799,
      balanceAfter: 44142,
    });
    expect(todayTotals(4).moneyOut).toBe(3999);
  });

  it("ends the day on today's balance", () => {
    expect(todayTotals(6)).toEqual({
      moneyIn: 4000,
      moneyOut: 3999,
      balanceAfter: SAMPLE.balanceToday,
    });
    expect(todayTotals(DEMO_STEPS - 1)).toEqual(todayTotals(6));
  });
});

describe("entryShown", () => {
  it("shows an entry from its arrival until the entries clear away", () => {
    const [first] = TODAY_ENTRIES;
    if (!first) throw new Error("no entries");
    expect(entryShown(first, 1)).toBe(false);
    expect(entryShown(first, 2)).toBe(true);
    expect(entryShown(first, 17)).toBe(true);
    expect(entryShown(first, 18)).toBe(false);
  });
});

describe("tween", () => {
  it("moves part of the way, to the nearest cent", () => {
    expect(tween(cents(0), cents(2799), 0)).toBe(0);
    expect(tween(cents(0), cents(2799), 0.5)).toBe(1400);
    expect(tween(cents(0), cents(2799), 1)).toBe(2799);
    expect(tween(cents(44142), cents(42942), 0.25)).toBe(43842);
  });

  it("tweens every total together", () => {
    const from = todayTotals(0);
    const to = todayTotals(2);
    expect(tweenTotals(from, to, 1)).toEqual(to);
    expect(sameTotals(tweenTotals(from, to, 0), from)).toBe(true);
    expect(sameTotals(from, to)).toBe(false);
  });
});

describe("easeOutCubic", () => {
  it("runs from 0 to 1, fast at first", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it("clamps progress outside 0 to 1", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe("the conversation", () => {
  it("logs the lunch it was told about, with the figures behind the answer", () => {
    expect(CHAT[2]?.text).toBe(
      `Logged ${formatCents(cents(1200))} for Lunch. ${STANDING}`,
    );
  });

  it("arrives in order, with typing before the agent's replies", () => {
    const arrivals = CHAT.map((message) => message.arrivesAt);
    expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b));
    expect(typingShown(5)).toBe(true);
    expect(typingShown(6)).toBe(false);
  });

  it("fades out at the end of a loop", () => {
    expect(threadShown(0)).toBe(false);
    expect(threadShown(17)).toBe(true);
    expect(threadShown(18)).toBe(false);
  });
});

describe("the hero chart and pipeline", () => {
  it("covers the chart only at the start of a loop", () => {
    expect(chartDrawing(0)).toBe(false);
    expect(chartDrawing(1)).toBe(true);
  });

  it("lights each of the four stages for five steps", () => {
    expect(litStage(0)).toBe(0);
    expect(litStage(4)).toBe(0);
    expect(litStage(5)).toBe(1);
    expect(litStage(DEMO_STEPS - 1)).toBe(3);
  });
});
