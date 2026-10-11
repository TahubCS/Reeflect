import { describe, expect, it } from "vitest";
import {
  billReminderText,
  dueWords,
  safeName,
  subscriptionAlertText,
} from "./copy";

// ADR-038: a proactive text never carries an amount. Dates may hold digits
// ("October 15"); money may not.
const MONEY = /[$¢€£]|\d+\.\d{2}\b|\bdollars?\b|\bcents?\b/i;

describe("safeName", () => {
  it("keeps an ordinary name", () => {
    expect(safeName("  Netflix ", "a payment")).toBe("Netflix");
  });

  it("drops a name that could hold an amount", () => {
    for (const name of ["Gym $30", "Spotify 9.99", "Plan 2", "", "  "]) {
      expect(safeName(name, "a payment")).toBe("a payment");
    }
  });
});

describe("proactive copy", () => {
  it("names the subscription and the replies, with no amount", () => {
    const text = subscriptionAlertText("Netflix");

    expect(text).toContain("Netflix");
    for (const word of ["KEEP", "CANCEL", "IGNORE", "DETAILS"]) {
      expect(text).toContain(word);
    }
    expect(text).not.toMatch(MONEY);
    expect(text).not.toMatch(/\d/);
  });

  it("never lets a name put an amount on the lock screen", () => {
    expect(subscriptionAlertText("Gym $30.00")).not.toMatch(MONEY);
    expect(
      billReminderText({
        name: "Rent $1,500",
        when: "tomorrow",
        autopay: false,
      }),
    ).toBe(
      "One of your bills is due tomorrow. Reply DETAILS to see the amount.",
    );
  });

  it("writes a bill reminder, with and without autopay", () => {
    expect(
      billReminderText({
        name: "Car loan",
        when: "on Friday, October 16",
        autopay: false,
      }),
    ).toBe(
      "Your Car loan bill is due on Friday, October 16. Reply DETAILS to see the amount.",
    );
    const autopay = billReminderText({
      name: "Electric",
      when: "today",
      autopay: true,
    });
    expect(autopay).toContain("paid automatically");
    expect(autopay).not.toMatch(MONEY);
  });

  it("says today, tomorrow or the date", () => {
    expect(dueWords(0, "Sunday, October 11")).toBe("today");
    expect(dueWords(1, "Monday, October 12")).toBe("tomorrow");
    expect(dueWords(6, "Saturday, October 17")).toBe("on Saturday, October 17");
  });
});
