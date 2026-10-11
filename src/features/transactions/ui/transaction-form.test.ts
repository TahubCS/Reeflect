import { describe, expect, it } from "vitest";
import { transactionsPath } from "./transaction-form";

describe("transactionsPath", () => {
  it("drops the account filter, so Review transfers and Bills links work", () => {
    const path = transactionsPath("/w/ws-1/transactions?account=acc-1");

    expect(path).toBe("/w/ws-1/transactions");
    expect(`${path}/transfers`).toBe("/w/ws-1/transactions/transfers");
    expect(path.replace(/\/transactions$/, "/bills")).toBe("/w/ws-1/bills");
  });

  it("leaves a plain Transactions path as it is", () => {
    expect(transactionsPath("/w/ws-1/transactions")).toBe(
      "/w/ws-1/transactions",
    );
  });
});
