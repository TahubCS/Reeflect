import { describe, expect, it } from "vitest";
import { hasOwnDigits } from "./digitScan";
import { fill, labelsIn, withoutLabels } from "./fill";

const values = { cash_total: "$1,204.99", top_category_1_name: "Groceries" };

describe("fill", () => {
  it("puts values in place of labels, as often as they appear", () => {
    expect(
      fill(
        "You have {cash_total}. Yes, {cash_total}, mostly {top_category_1_name}.",
        values,
      ),
    ).toEqual({
      ok: true,
      text: "You have $1,204.99. Yes, $1,204.99, mostly Groceries.",
    });
  });

  it("leaves a draft without labels as it is", () => {
    expect(fill("I can only help with your money.", values)).toEqual({
      ok: true,
      text: "I can only help with your money.",
    });
  });

  it("refuses a label it has no value for", () => {
    expect(fill("You have {cash_total} and {net_worth}.", values)).toEqual({
      ok: false,
      reason: "unknown_label",
    });
    // A label that exists only on Object.prototype is still unknown.
    expect(fill("{constructor}", values)).toEqual({
      ok: false,
      reason: "unknown_label",
    });
  });

  it("refuses braces that are not a well-formed label", () => {
    for (const draft of [
      "You have {Cash Total}.",
      "You have {cash_total.",
      "You have cash_total}.",
      "You have {}.",
      "You have {{cash_total}}.",
    ]) {
      expect(fill(draft, values)).toEqual({ ok: false, reason: "stray_brace" });
    }
  });

  it("does not treat a value's own braces or digits as part of the draft", () => {
    expect(fill("{cash_total}", { cash_total: "{9}" })).toEqual({
      ok: true,
      text: "{9}",
    });
  });
});

describe("labelsIn and withoutLabels", () => {
  it("list and remove the labels", () => {
    const draft = "A {cash_total} b {top_category_1_name} c {cash_total}";

    expect(labelsIn(draft)).toEqual([
      "cash_total",
      "top_category_1_name",
      "cash_total",
    ]);
    expect(withoutLabels(draft)).toBe("A  b  c ");
  });
});

describe("hasOwnDigits", () => {
  it("allows digits inside label names only", () => {
    expect(hasOwnDigits("Mostly {top_category_1_name}.")).toBe(false);
    expect(hasOwnDigits("No figures here.")).toBe(false);
  });

  it("finds a digit the model wrote, in any script", () => {
    for (const draft of [
      "You have $1,204.",
      "About 3 subscriptions.",
      "{cash_total} is 10% more.",
      "You have ١٢٣ dollars.",
      "You have １２ dollars.",
    ]) {
      expect(hasOwnDigits(draft)).toBe(true);
    }
  });
});
