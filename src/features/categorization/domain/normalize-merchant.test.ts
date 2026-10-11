import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "../client";

describe("normalizeMerchant", () => {
  it.each([
    ["  CORNER\tMARKET\n ", "corner market"],
    ["Corner Market Store #0042", "corner market"],
    ["Corner Market store no. 0042", "corner market"],
    ["Corner Market location: 42", "corner market"],
    ["Corner Market loc #42", "corner market"],
    ["Corner Market #0042", "corner market"],
    ["Corner Market #0042 #0099", "corner market"],
    ["WALMART #1234 RALEIGH NC", "walmart"],
    ["WALMART #5678 DURHAM NC 27701", "walmart"],
    ["Corner Market STORE #42 CHAPEL HILL NC REF ABC123", "corner market"],
    ["Corner Market location: 42 NEW YORK NY 10001-1234", "corner market"],
    ["Corner Market #0042 Unknown location", "corner market unknown location"],
    [" #1 Chinese Restaurant ", "#1 chinese restaurant"],
    ["Studio 54 Raleigh NC", "studio 54 raleigh nc"],
    ["#0042", ""],
    ["#1 Chinese Restaurant", "#1 chinese restaurant"],
    ["Corner Market #0042 REF ABC123", "corner market"],
    ["Corner Market STORE #0042 REFERENCE CODE ABC-123", "corner market"],
    ["Corner Market REF: ABC123", "corner market"],
    ["Corner Market AUTHORIZATION #12345", "corner market"],
    ["Corner Market confirmation id A123B", "corner market"],
    ["Corner Market TXN 12345", "corner market"],
    ["Corner Market transaction number 12345", "corner market"],
    ["7-Eleven #0042", "7-eleven"],
    ["24 Hour Fitness", "24 hour fitness"],
    ["Studio 54", "studio 54"],
    ["99 Ranch Market", "99 ranch market"],
    ["Refinery123", "refinery123"],
    ["Store24", "store24"],
    ["Reference Books", "reference books"],
    ["Café Étoile", "café étoile"],
    ["ＣＡＦＥ ２４", "cafe 24"],
    ["", ""],
    [" \t\n", ""],
  ])("normalizes %j to %j", (description, expected) => {
    expect(normalizeMerchant(description)).toBe(expected);
  });

  it.each([
    "CORNER MARKET STORE #42 REF ABC123",
    "CORNER MARKET #42 #99",
    "#42",
    "#1 Chinese Restaurant",
    "WALMART #1234 RALEIGH NC",
  ])("normalizes %j idempotently without retaining regex state", (raw) => {
    const normalized = normalizeMerchant(raw);

    expect(normalizeMerchant(normalized)).toBe(normalized);
    expect(normalizeMerchant(raw)).toBe(normalized);
    expect(normalizeMerchant("Other shop AUTH 98765")).toBe("other shop");
    expect(normalizeMerchant(raw)).toBe(normalized);
  });
});
