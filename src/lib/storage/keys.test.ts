import { describe, expect, it } from "vitest";
import { accountPrefix, statementCsvKey } from "./keys";

describe("statement keys", () => {
  it("nests each CSV under its workspace and account", () => {
    expect(statementCsvKey("ws", "acct", "batch")).toBe(
      "w/ws/a/acct/batch.csv",
    );
    expect(
      statementCsvKey("ws", "acct", "batch").startsWith(
        accountPrefix("ws", "acct"),
      ),
    ).toBe(true);
  });
});
