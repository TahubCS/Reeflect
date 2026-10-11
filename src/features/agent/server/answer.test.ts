import { afterAll, describe, expect, it, vi } from "vitest";
import { createAccount } from "@/features/accounts/server/repository";
import { createTransaction } from "@/features/transactions/server/repository";
import { hasOwnDigits } from "@/lib/ai/digitScan";
import { withoutLabels } from "@/lib/ai/fill";
import { type AiRequest, AiUnavailableError } from "@/lib/ai/client";
import { cents } from "@/lib/money";
import { fixtures } from "../../../../tests/support/db-fixtures";
import { answer } from "./answer";
import { getSummary } from "./tools/getSummary";

// Integration tests against the Docker database (TEST-05). The model is a
// fake; the figures come from real rows through the Insights code.

const f = fixtures();
const NOW = new Date();
const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);

/** A workspace with a checking account, a card, a paycheque and spending. */
async function workspaceWithMoney(checking: number): Promise<string> {
  const userId = await f.newUser();
  const workspaceId = await f.newWorkspace({ [userId]: "owner" });
  const account = (type: "checking" | "credit_card", balance: number) =>
    createAccount(workspaceId, {
      type,
      institutionName: "Test Bank",
      nickname: type,
      maskLast4: null,
      balanceCents: cents(balance),
    });
  const checkingId = await account("checking", checking);
  await account("credit_card", -25_000);
  const row = (amount: number, description: string, days: number) =>
    createTransaction(workspaceId, {
      description,
      isTransfer: false,
      ledger: {
        accountId: checkingId,
        postedOn: daysAgo(days),
        amountCents: cents(amount),
        status: "posted",
      },
    });
  await row(300_000, "PAYROLL ACME", 20);
  await row(-80_000, "RENT", 15);
  await row(-12_345, "CORNER MARKET", 5);
  return workspaceId;
}

const generating = (draft: string) =>
  vi.fn<(request: AiRequest) => Promise<string>>(async () => draft);

afterAll(async () => {
  await f.cleanUp();
});

describe("answer", () => {
  it("fills a model's draft with this workspace's figures", async () => {
    const workspaceId = await workspaceWithMoney(500_000);
    const facts = await getSummary(workspaceId, NOW);
    const generate = generating(
      "You have {cash_total} and owe {owed_total}. About {spending} goes out a month.",
    );

    const reply = await answer("how am I doing?", workspaceId, {
      generate,
      now: NOW,
    });

    expect(facts.state).toBe("ready");
    expect(facts.values.owed_total).toBe("$250.00");
    expect(reply).toBe(
      `You have ${facts.values.cash_total} and owe $250.00. About ${facts.values.spending} goes out a month.`,
    );
    expect(reply).not.toMatch(/[{}]/);
  });

  it("sends the model labels and the person's text, never a figure", async () => {
    const workspaceId = await workspaceWithMoney(500_000);
    const facts = await getSummary(workspaceId, NOW);
    const generate = generating("You have {cash_total}.");

    await answer("how am I doing?", workspaceId, { generate, now: NOW });

    const sent = generate.mock.calls[0]![0];
    expect(sent.user).toContain("how am I doing?");
    expect(sent.user).toContain("{cash_total}");
    // Label names hold digits ({top_category_2_name}), so look outside them.
    const outsideLabels = withoutLabels(`${sent.system}\n${sent.user}`);
    for (const value of Object.values(facts.values)) {
      expect(outsideLabels).not.toContain(value);
    }
    expect(hasOwnDigits(`${sent.system}\n${sent.user}`)).toBe(false);
  });

  it.each([
    ["a digit of its own", "You have $5,000, nice."],
    ["a label that does not exist", "Your net worth is {net_worth}."],
    ["a malformed label", "You have {Cash Total}."],
    ["a reply far too long", "word ".repeat(200)],
  ])(
    "uses the code-built reply when the draft has %s",
    async (_case, draft) => {
      const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
      const workspaceId = await workspaceWithMoney(500_000);
      const facts = await getSummary(workspaceId, NOW);

      const reply = await answer("how am I doing?", workspaceId, {
        generate: generating(draft),
        now: NOW,
      });

      expect(reply).toContain(
        `You have ${facts.values.cash_total} in checking and savings`,
      );
      expect(reply).toContain("owe $250.00 on cards and loans");
      expect(reply).not.toMatch(/[{}]/);
      // The log names the reason, never the draft.
      expect(JSON.stringify(warned.mock.calls)).not.toContain(
        draft.slice(0, 20),
      );
      warned.mockRestore();
    },
  );

  it("uses the code-built reply when no model answers or the call fails", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const workspaceId = await workspaceWithMoney(500_000);

    for (const failure of [new AiUnavailableError([]), new Error("network")]) {
      const reply = await answer("how am I doing?", workspaceId, {
        generate: vi.fn(async () => {
          throw failure;
        }),
        now: NOW,
      });
      expect(reply).toMatch(/^You have \$[\d,]+\.\d\d in checking and savings/);
    }
    warned.mockRestore();
  });

  it("answers from the given workspace only", async () => {
    const mine = await workspaceWithMoney(111_100);
    const theirs = await workspaceWithMoney(999_900);
    const generate = generating("Cash: {cash_total}.");
    const myCash = (await getSummary(mine, NOW)).values.cash_total!;
    const theirCash = (await getSummary(theirs, NOW)).values.cash_total!;

    const reply = await answer("how am I doing?", mine, { generate, now: NOW });

    expect(myCash).not.toBe(theirCash);
    expect(reply).toBe(`Cash: ${myCash}.`);
  });

  it("says there are no accounts yet for an empty workspace", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const userId = await f.newUser();
    const workspaceId = await f.newWorkspace({ [userId]: "owner" });

    // No key is set under test, so this is the real, key-less path.
    const reply = await answer("how am I doing?", workspaceId);

    expect(reply).toContain("no accounts for you yet");
    warned.mockRestore();
  });
});
