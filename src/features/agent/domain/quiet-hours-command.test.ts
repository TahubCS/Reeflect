import { describe, expect, it } from "vitest";
import { parseLog } from "./log";
import {
  type QuietHoursCommand,
  parseQuietHoursCommand,
} from "./quiet-hours-command";

const at = (hour: number, minute = 0) => hour * 60 + minute;
const set = (start: number, end: number): QuietHoursCommand => ({
  type: "set",
  hours: { startMinute: start, endMinute: end },
});

describe("parseQuietHoursCommand: what is set", () => {
  it.each<[string, QuietHoursCommand]>([
    // The three forms ADR-038 names.
    ["Reeflect, register new quiet hours 11PM to 7 AM", set(at(23), at(7))],
    ["quiet hours 11pm to 7am", set(at(23), at(7))],
    ["quiet hours 11 PM - 7 AM", set(at(23), at(7))],
    ["quiet hours 23:00 to 07:00", set(at(23), at(7))],
    // Other ways to say it.
    ["Set my quiet hours to be 10pm to 6am.", set(at(22), at(6))],
    ["quiet hours: 10:30 p.m. until 6:45 a.m.", set(at(22, 30), at(6, 45))],
    ["QUIET HOURS 11PM-7AM", set(at(23), at(7))],
    ["quiet hours from 11pm to 7am please", set(at(23), at(7))],
    ["quiet-hours 9pm – 8am", set(at(21), at(8))],
    ["quiet hour 1am to 5am", set(at(1), at(5))],
    // Midnight and noon, in words and in numbers.
    ["quiet hours midnight to 8am", set(0, at(8))],
    ["quiet hours 10pm to noon", set(at(22), at(12))],
    ["quiet hours 12am to 6am", set(0, at(6))],
    ["quiet hours 12pm to 1pm", set(at(12), at(13))],
    ["quiet hours 00:00 to 06:30", set(0, at(6, 30))],
    // A range inside one day is allowed.
    ["quiet hours 1pm to 3pm", set(at(13), at(15))],
    // Found by the agent review (HO-115).
    ["set quiet hours to 10pm to 6am", set(at(22), at(6))],
    ["change my quiet hours to 11pm-7am", set(at(23), at(7))],
    ["quiet hours between 10pm and 6am", set(at(22), at(6))],
    ["quiet hours between 10 pm and 6 am", set(at(22), at(6))],
  ])("%s", (text, expected) => {
    expect(parseQuietHoursCommand(text)).toEqual(expected);
  });
});

describe("parseQuietHoursCommand: what is not sure", () => {
  it.each([
    // No AM or PM, and not the 24-hour form: which 11?
    "quiet hours 11 to 7",
    "quiet hours 11:00 to 7:00",
    "quiet hours 11pm to 7",
    // Times that do not exist.
    "quiet hours 13pm to 7am",
    "quiet hours 0am to 7am",
    "quiet hours 11:75pm to 7am",
    "quiet hours 24:00 to 07:00",
    // Start and end the same.
    "quiet hours 9pm to 9pm",
    "quiet hours midnight to 12am",
    // Not a range.
    "quiet hours 11pm",
    "turn off quiet hours",
    "quiet hours eleven to seven",
    "quiet hours 11pm to 7am and 1pm to 2pm",
  ])("%s", (text) => {
    expect(parseQuietHoursCommand(text)).toEqual({ type: "unclear" });
  });
});

describe("parseQuietHoursCommand: questions and other texts", () => {
  it.each([
    "quiet hours",
    "Quiet hours?",
    "what are my quiet hours?",
    "what time are my quiet hours?",
    "when are my quiet hours",
    "what are my current quiet hours?",
  ])("shows them for %s", (text) => {
    expect(parseQuietHoursCommand(text)).toEqual({ type: "show" });
  });

  it.each(["12 lunch", "how am I doing?", "UNDO", "it was quiet at 11pm", ""])(
    "leaves %s alone",
    (text) => {
      expect(parseQuietHoursCommand(text)).toEqual({ type: "none" });
    },
  );

  it("leaves a long paragraph alone", () => {
    expect(
      parseQuietHoursCommand(
        `quiet hours 11pm to 7am ${"and so on ".repeat(20)}`,
      ),
    ).toEqual({ type: "none" });
  });

  it("is read before logging, which would answer an unclear one", () => {
    // Why runAgentTurn asks this parser first: logging would reply about
    // amounts instead of giving the quiet-hours example.
    expect(parseLog("quiet hours 11 to 7")).toEqual({
      type: "unclear",
      reason: "several_amounts",
    });
  });
});
