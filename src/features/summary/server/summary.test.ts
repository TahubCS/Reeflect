import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getSummary } from "@/features/agent";
import { createAccount } from "@/features/accounts/server/repository";
import { createTransaction } from "@/features/transactions/server/repository";
import { hasOwnDigits } from "@/lib/ai/digitScan";
import { withoutLabels } from "@/lib/ai/fill";
import { type AiRequest, AiUnavailableError } from "@/lib/ai/client";
import { cents } from "@/lib/money";
import { fixtures, isNotFound } from "../../../../tests/support/db-fixtures";
import { PANEL_SCHEMA } from "../domain/panel";
import { loadSummaryPanel, writeSummary } from "./summary";

// Integration tests against the Docker database (TEST-05). The session and
// the model are fakes; the figures come from real rows.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

const f = fixtures();
const NOW = new Date();
const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);

let viewer: string;
let stranger: string;
let workspace: string;
let empty: string;

const generating = (answer: unknown) =>
  vi.fn<(request: AiRequest) => Promise<string>>(async () =>
    typeof answer === "string" ? answer : JSON.stringify(answer),
  );

const signIn = (userId: string) =>
  getSession.mockResolvedValue({ user: { id: userId } });

beforeAll(async () => {
  viewer = await f.newUser();
  stranger = await f.newUser();
  workspace = await f.newWorkspace({ [viewer]: "viewer" });
  empty = await f.newWorkspace({ [viewer]: "viewer" });
  const account = (type: "checking" | "credit_card", balance: number) =>
    createAccount(workspace, {
      type,
      institutionName: "Test Bank",
      nickname: type,
      maskLast4: null,
      balanceCents: cents(balance),
    });
  const checking = await account("checking", 500_000);
  await account("credit_card", -25_000);
  const row = (amount: number, description: string, days: number) =>
    createTransaction(workspace, {
      description,
      isTransfer: false,
      ledger: {
        accountId: checking,
        postedOn: daysAgo(days),
        amountCents: cents(amount),
        status: "posted",
      },
    });
  await row(300_000, "PAYROLL ACME", 20);
  await row(-80_000, "RENT", 15);
  await row(-12_345, "CORNER MARKET", 5);
});

afterAll(async () => {
  await f.cleanUp();
});

describe("loadSummaryPanel", () => {
  it("builds the panel from this workspace's figures, without a model", async () => {
    signIn(viewer);
    const facts = await getSummary(workspace, NOW);

    const panel = await loadSummaryPanel(workspace, NOW);

    expect(facts.values.owed_total).toBe("$250.00");
    expect(panel?.source).toBe("code");
    expect(panel?.summary).toContain(
      `You have ${facts.values.cash_total} in checking and savings and owe $250.00 on cards and loans.`,
    );
    // Every label was filled in.
    expect(
      [panel?.summary, ...(panel?.suggestions ?? [])].join(" "),
    ).not.toMatch(/[{}]/);
  });

  it("has no panel for a workspace without accounts", async () => {
    signIn(viewer);

    expect(await loadSummaryPanel(empty, NOW)).toBeNull();
  });

  it("is not found for someone who is not a member, or signed out", async () => {
    signIn(stranger);
    await expect(loadSummaryPanel(workspace, NOW)).rejects.toSatisfy(
      isNotFound,
    );
    getSession.mockResolvedValue(null);
    await expect(loadSummaryPanel(workspace, NOW)).rejects.toSatisfy(
      isNotFound,
    );
  });
});

describe("writeSummary", () => {
  it("fills a model's draft with this workspace's figures", async () => {
    signIn(viewer);
    const facts = await getSummary(workspace, NOW);
    const generate = generating({
      summary: "You have {cash_total} and owe {owed_total}.",
      suggestions: ["About {spending} goes out a month."],
    });

    const panel = await writeSummary(workspace, { generate, now: NOW });

    expect(panel).toEqual({
      source: "model",
      summary: `You have ${facts.values.cash_total} and owe $250.00.`,
      suggestions: [`About ${facts.values.spending} goes out a month.`],
    });
  });

  it("sends the model labels and the shape, never a figure", async () => {
    signIn(viewer);
    const facts = await getSummary(workspace, NOW);
    const generate = generating({ summary: "Hello.", suggestions: [] });

    await writeSummary(workspace, { generate, now: NOW });

    const sent = generate.mock.calls[0]![0];
    expect(sent.schema).toBe(PANEL_SCHEMA);
    expect(sent.user).toContain("{cash_total}");
    const outsideLabels = withoutLabels(`${sent.system}\n${sent.user}`);
    for (const value of Object.values(facts.values)) {
      expect(outsideLabels).not.toContain(value);
    }
    expect(hasOwnDigits(`${sent.system}\n${sent.user}`)).toBe(false);
  });

  it.each([
    ["is not JSON", "You have {cash_total}."],
    [
      "has a digit of its own",
      { summary: "You have $5,000.", suggestions: [] },
    ],
    [
      "has a suggestion with a label that does not exist",
      {
        summary: "You have {cash_total}.",
        suggestions: ["{net_worth} is up."],
      },
    ],
  ])(
    "returns the code-built panel when the answer %s",
    async (_case, answer) => {
      const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
      signIn(viewer);

      const panel = await writeSummary(workspace, {
        generate: generating(answer),
        now: NOW,
      });

      expect(panel).toEqual(await loadSummaryPanel(workspace, NOW));
      expect(panel?.source).toBe("code");
      // The log names the reason, never the draft.
      expect(JSON.stringify(warned.mock.calls)).not.toContain("You have");
      warned.mockRestore();
    },
  );

  it("returns the code-built panel when no model answers or the call fails", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    signIn(viewer);
    const built = await loadSummaryPanel(workspace, NOW);

    for (const failure of [new AiUnavailableError([]), new Error("network")]) {
      const panel = await writeSummary(workspace, {
        generate: vi.fn(async () => {
          throw failure;
        }),
        now: NOW,
      });
      expect(panel).toEqual(built);
    }
    // No key is set under test, so this is the real, key-less path.
    expect(await writeSummary(workspace, { now: NOW })).toEqual(built);
    warned.mockRestore();
  });

  it("asks no model for a workspace without accounts", async () => {
    signIn(viewer);
    const generate = generating({ summary: "Hello.", suggestions: [] });

    expect(await writeSummary(empty, { generate, now: NOW })).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("is not found for someone who is not a member, and asks no model", async () => {
    signIn(stranger);
    const generate = generating({ summary: "Hello.", suggestions: [] });

    await expect(
      writeSummary(workspace, { generate, now: NOW }),
    ).rejects.toSatisfy(isNotFound);
    expect(generate).not.toHaveBeenCalled();
  });
});
