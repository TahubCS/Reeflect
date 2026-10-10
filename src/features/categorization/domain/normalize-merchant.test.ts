import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "../index";

describe("normalizeMerchant", () => {
  it.each([
    ["  CORNER\tMARKET\n ", "corner market"],
    ["Corner Market Store #0042", "corner market"],
    ["Corner Market store no. 0042", "corner market"],
    ["Corner Market location: 42", "corner market"],
    ["Corner Market loc #42", "corner market"],
    ["Corner Market #0042", "corner market"],
    ["Corner Market #0042 #0099", "corner market"],
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
  ])("normalizes %j idempotently without retaining regex state", (raw) => {
    const normalized = normalizeMerchant(raw);

    expect(normalizeMerchant(normalized)).toBe(normalized);
    expect(normalizeMerchant(raw)).toBe(normalized);
    expect(normalizeMerchant("Other shop AUTH 98765")).toBe("other shop");
    expect(normalizeMerchant(raw)).toBe(normalized);
  });
});
