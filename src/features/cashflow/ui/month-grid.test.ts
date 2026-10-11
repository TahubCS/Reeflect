import { describe, expect, it } from "vitest";
import { cents } from "@/lib/money";
import type { DayView, Item } from "../domain/cashflow";
import { describeDay } from "./month-grid";

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    date: "2026-02-10",
    name: "StreamFlix",
    amount: cents(-1599),
    kind: "subscription",
    category: "Subscriptions",
    planned: false,
    recurringId: "rec-1",
    ...overrides,
  };
}

function day(items: Item[]): DayView {
  return {
    date: "2026-02-10",
    day: 10,
    isToday: false,
    isFuture: false,
    items,
    moneyIn: cents(0),
    moneyOut: cents(1599),
    everydaySpent: cents(0),
    endBalance: cents(120000),
    noSpend: false,
  };
}

describe("describeDay", () => {
  it("says in words that a subscription is planned to be cancelled", () => {
    const label = describeDay(day([item()]), new Set(["rec-1"]));

    expect(label).toContain("StreamFlix");
    expect(label).toContain("planning to cancel");
  });

  it("says nothing about cancelling when no plan matches the item", () => {
    expect(describeDay(day([item()]), new Set(["rec-2"]))).not.toContain(
      "cancel",
    );
    expect(
      describeDay(day([item({ recurringId: undefined })]), new Set(["rec-1"])),
    ).not.toContain("cancel");
  });

  it("keeps the other states and the balance", () => {
    const label = describeDay(
      day([item({ onCard: true, unconfirmed: true })]),
      new Set(),
    );

    expect(label).toContain("on card");
    expect(label).toContain("planned, not confirmed");
    expect(label).toMatch(/balance \$1,200\.00$/);
  });
});
