import { describe, expect, it } from "vitest";
import {
  chargeEvidence,
  describeEvidence,
  gapNote,
  gapTolerance,
  longDate,
  shortDate,
} from "./evidence";

const charges = (...dates: string[]) =>
  dates.map((postedOn, index) => ({ id: String(index), postedOn }));

describe("chargeEvidence", () => {
  it("orders oldest first and counts the days between charges", () => {
    const evidence = chargeEvidence(
      charges("2026-07-09", "2026-05-09", "2026-06-09"),
    );
    expect(evidence.steps.map((step) => step.postedOn)).toEqual([
      "2026-05-09",
      "2026-06-09",
      "2026-07-09",
    ]);
    expect(evidence.steps.map((step) => step.gapDays)).toEqual([null, 31, 30]);
    expect(evidence.usualGap).toBe(31);
  });

  it("keeps each charge's own fields", () => {
    const [step] = chargeEvidence([
      { postedOn: "2026-05-09", amountCents: -1549 },
    ]).steps;
    expect(step).toEqual({
      postedOn: "2026-05-09",
      amountCents: -1549,
      gapDays: null,
      offPattern: false,
    });
  });

  it("lets a monthly charge move a few days across short months", () => {
    const evidence = chargeEvidence(
      charges("2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"),
    );
    expect(evidence.steps.some((step) => step.offPattern)).toBe(false);
  });

  it("calls out a gap well away from the usual one", () => {
    const evidence = chargeEvidence(
      charges(
        "2026-05-01",
        "2026-05-31",
        "2026-06-30",
        "2026-08-14",
        "2026-09-13",
      ),
    );
    expect(evidence.usualGap).toBe(30);
    expect(evidence.steps.map((step) => step.offPattern)).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it("has no usual gap for a single charge or none", () => {
    expect(chargeEvidence(charges("2026-05-01")).usualGap).toBeNull();
    expect(chargeEvidence([]).steps).toEqual([]);
  });
});

describe("gapTolerance", () => {
  it("allows at least 3 days, and more for longer rhythms", () => {
    expect(gapTolerance(7)).toBe(3);
    expect(gapTolerance(30)).toBe(5);
    expect(gapTolerance(365)).toBe(55);
  });
});

describe("describeEvidence", () => {
  it("says so when there are no charges or just one", () => {
    expect(describeEvidence(chargeEvidence([]))).toBe("No charges found yet");
    expect(describeEvidence(chargeEvidence(charges("2026-05-01")))).toBe(
      "One charge so far",
    );
  });

  it("gives one figure for an even rhythm", () => {
    expect(
      describeEvidence(
        chargeEvidence(charges("2026-09-01", "2026-09-15", "2026-09-29")),
      ),
    ).toBe("Every 14 days, no breaks");
  });

  it("gives a range for months of different lengths", () => {
    expect(
      describeEvidence(
        chargeEvidence(charges("2026-05-09", "2026-06-09", "2026-07-09")),
      ),
    ).toBe("Every 30–31 days, no breaks");
  });

  it("names the gaps that break the rhythm", () => {
    expect(
      describeEvidence(
        chargeEvidence(
          charges(
            "2026-05-01",
            "2026-05-31",
            "2026-06-30",
            "2026-08-14",
            "2026-09-13",
          ),
        ),
      ),
    ).toBe("Every 30 days; 1 gap of 45 days");
  });

  it("falls back to the usual gap when every gap is off", () => {
    // Two gaps far apart: the usual one is their middle, and both are off.
    expect(
      describeEvidence(
        chargeEvidence(charges("2026-01-01", "2026-01-08", "2026-04-08")),
      ),
    ).toBe("About 49 days apart; 2 gaps of 7 days, 90 days");
  });
});

describe("dates and notes", () => {
  it("formats short and long dates without time zones", () => {
    expect(shortDate("2026-10-09")).toBe("Oct 9");
    expect(longDate("2027-01-31")).toBe("Jan 31, 2027");
  });

  it("describes the gap under each charge", () => {
    expect(gapNote({ gapDays: null, offPattern: false })).toBe(
      "First one found",
    );
    expect(gapNote({ gapDays: 1, offPattern: false })).toBe(
      "1 day after the one before",
    );
    expect(gapNote({ gapDays: 45, offPattern: true })).toBe(
      "45 days after the one before, off the usual rhythm",
    );
  });
});
