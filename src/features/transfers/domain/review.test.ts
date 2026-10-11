import { describe, expect, it } from "vitest";
import {
  calendarGap,
  eligible,
  matchesFacts,
  matchesState,
  pairStatus,
  reviewQuery,
  shiftDay,
  writeSchema,
  type ReviewRow,
} from "./review";
const today = "2026-10-11";
const a: ReviewRow = {
  id: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  accountId: crypto.randomUUID(),
  postedOn: today,
  amountCents: -20000,
  description: "Repayment",
  status: "posted",
  isTransfer: false,
  pairId: null,
  updatedAt: "2026-10-11T12:00:00.123456Z",
  accountName: "Cash",
  accountType: "checking",
  ownedAccount: true,
};
const b = {
  ...a,
  id: crypto.randomUUID(),
  accountId: crypto.randomUUID(),
  amountCents: 20000,
};
describe("explicit transfer review", () => {
  it("defaults to 90 inclusive days and accepts older bounded windows", () => {
    expect(reviewQuery({}, today)).toMatchObject({
      from: "2026-07-14",
      to: today,
      page: 1,
      matchPage: 1,
      view: "review",
    });
    expect(
      reviewQuery(
        {
          from: "2025-12-31",
          to: "2026-01-03",
          account: "",
          other: "",
          source: "",
          page: "2",
          matchPage: "3",
          view: "all",
        },
        today,
      ),
    ).toMatchObject({
      from: "2025-12-31",
      page: 2,
      matchPage: 3,
      account: undefined,
    });
    expect(reviewQuery({ to: "2026-01-01" }, today)?.from).toBe("2025-10-04");
    expect(reviewQuery({ from: "2025-10-11" }, today)).not.toBeNull();
  });
  it.each([
    { from: "2026-02-30" },
    { account: "guess" },
    { page: 0 },
    { matchPage: 101 },
    { from: [today] },
    { from: "1999-12-31" },
    { to: "2026-10-12" },
    { from: "2026-10-10", to: "2026-10-09" },
    { from: "2025-10-10" },
  ])("rejects invalid or excessive query %j", (query) =>
    expect(reviewQuery(query, today)).toBeNull(),
  );
  it("uses calendar days across years, leap days and DST", () => {
    expect(shiftDay("2026-01-01", -3)).toBe("2025-12-29");
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");
    expect(calendarGap("2026-03-07", "2026-03-10")).toBe(3);
    expect(
      eligible(
        { ...a, postedOn: "2025-12-31" },
        { ...b, postedOn: "2026-01-03" },
        today,
      ),
    ).toBe(true);
    expect(eligible({ ...a, postedOn: "2026-10-08" }, b, today)).toBe(true);
  });
  it("allows individually labelled rows and requires explicit confirmation", () => {
    expect(eligible({ ...a, isTransfer: true }, b, today)).toBe(true);
    expect(
      writeSchema.safeParse({
        operation: "pair",
        expected: [a, b],
        confirmed: true,
      }).success,
    ).toBe(true);
    expect(
      writeSchema.safeParse({ operation: "pair", expected: [a, b] }).success,
    ).toBe(false);
    expect(
      writeSchema.safeParse({
        operation: "pair",
        expected: [a],
        confirmed: true,
      }).success,
    ).toBe(false);
    expect(
      writeSchema.safeParse({
        operation: "detach",
        expected: [],
        confirmed: true,
      }).success,
    ).toBe(false);
    expect(
      writeSchema.safeParse({
        operation: "detach",
        expected: Array(51).fill(a),
        confirmed: true,
      }).success,
    ).toBe(false);
    expect(
      writeSchema.safeParse({
        operation: "label",
        expected: [a],
        transfer: true,
        confirmed: true,
      }).success,
    ).toBe(true);
  });
  it.each([
    { id: a.id },
    { workspaceId: crypto.randomUUID() },
    { accountId: a.accountId },
    { ownedAccount: false },
    { status: "pending" as const },
    { amountCents: 0 },
    { amountCents: -20000 },
    { amountCents: 20001 },
    { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { postedOn: "2026-02-30" },
    { postedOn: "2026-10-12" },
    { postedOn: "2026-10-07" },
    { pairId: "existing" },
  ])("rejects an ineligible counterpart %j", (patch) =>
    expect(eligible(a, { ...b, ...patch }, today)).toBe(false),
  );
  it.each([
    { ownedAccount: false },
    { status: "pending" as const },
    { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { amountCents: 0 },
    { postedOn: "invalid" },
    { postedOn: "2026-10-12" },
    { pairId: "old" },
  ])("rejects an ineligible source %j", (patch) =>
    expect(eligible({ ...a, ...patch }, b, today)).toBe(false),
  );
  it("distinguishes confirmed, individual, orphan and invalid legacy groups", () => {
    const paired = [
      { ...a, pairId: "p", isTransfer: true },
      { ...b, pairId: "p", isTransfer: true },
    ];
    expect(pairStatus(paired, today)).toBe("confirmed");
    expect(pairStatus([paired[0]!], today)).toBe("incomplete");
    for (const group of [
      [],
      [...paired, a],
      [a, b],
      [paired[0]!, { ...paired[1]!, pairId: "other" }],
      [paired[0]!, { ...paired[1]!, isTransfer: false }],
      [paired[0]!, { ...paired[1]!, amountCents: 20001 }],
      [paired[0]!, { ...paired[1]!, ownedAccount: false }],
      [
        { ...a, pairId: "", isTransfer: true },
        { ...b, pairId: "", isTransfer: true },
      ],
    ])
      expect(pairStatus(group, today)).toBe("invalid");
  });
  it("compares all expected facts, classification and microsecond version", () => {
    expect(matchesFacts(a, a)).toBe(true);
    expect(matchesState(a, a)).toBe(true);
    for (const patch of [
      { id: b.id },
      { accountId: b.accountId },
      { postedOn: "2026-10-10" },
      { amountCents: -19999 },
      { status: "pending" as const },
      { description: "Changed" },
      { isTransfer: true },
      { pairId: "p" },
      { updatedAt: "2026-10-11T12:00:00.123457Z" },
    ])
      expect(matchesState(a, { ...a, ...patch })).toBe(false);
    expect(
      matchesFacts(a, {
        ...a,
        isTransfer: true,
        pairId: "p",
        updatedAt: b.updatedAt,
      }),
    ).toBe(true);
  });
});
