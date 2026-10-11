import { eq, inArray } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { getSummary } from "@/features/agent";
import { createAccount } from "@/features/accounts/server/repository";
import { createTransaction } from "@/features/transactions/server/repository";
import { hasOwnDigits } from "@/lib/ai/digitScan";
import { withoutLabels } from "@/lib/ai/fill";
import { type AiRequest, AiUnavailableError } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { summaryWrite } from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { fixtures, isNotFound } from "../../../../tests/support/db-fixtures";
import { DAILY_WRITES, PANEL_SCHEMA } from "../domain/panel";
import { loadSummaryPanel, writeSummary } from "./summary";

// Integration tests against the Docker database (TEST-05). The session and
// the model are fakes; the figures and the stored drafts are real rows.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

const f = fixtures();
const NOW = new Date();
const TOMORROW = new Date(NOW.getTime() + 86_400_000);
/** The day a summary asked for now is kept under. */
const TODAY = isoDateIn(NOW, DEFAULT_TIME_ZONE);
const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10);

let viewer: string;
let editor: string;
let stranger: string;
let workspace: string;
let other: string;
let empty: string;

const generating = (answer: unknown) =>
  vi.fn<(request: AiRequest) => Promise<string>>(async () =>
    typeof answer === "string" ? answer : JSON.stringify(answer),
  );
const GOOD = {
  summary: "You have {cash_total} and owe {owed_total}.",
  suggestions: ["About {spending} goes out a month."],
};

const signIn = (userId: string) =>
  getSession.mockResolvedValue({ user: { id: userId } });

const checking = (workspaceId: string, balance: number) =>
  createAccount(workspaceId, {
    type: "checking",
    institutionName: "Test Bank",
    nickname: "checking",
    maskLast4: null,
    balanceCents: cents(balance),
  });

const rowsFor = (workspaceId: string) =>
  db
    .select()
    .from(summaryWrite)
    .where(eq(summaryWrite.workspaceId, workspaceId));

beforeAll(async () => {
  viewer = await f.newUser();
  editor = await f.newUser();
  stranger = await f.newUser();
  workspace = await f.newWorkspace({ [viewer]: "viewer", [editor]: "editor" });
  other = await f.newWorkspace({ [viewer]: "viewer" });
  empty = await f.newWorkspace({ [viewer]: "viewer" });
  const account = await checking(workspace, 500_000);
  await createAccount(workspace, {
    type: "credit_card",
    institutionName: "Test Bank",
    nickname: "card",
    maskLast4: null,
    balanceCents: cents(-25_000),
  });
  await checking(other, 70_000);
  const row = (amount: number, description: string, days: number) =>
    createTransaction(workspace, {
      description,
      isTransfer: false,
      ledger: {
        accountId: account,
        postedOn: daysAgo(days),
        amountCents: cents(amount),
        status: "posted",
      },
    });
  await row(300_000, "PAYROLL ACME", 20);
  await row(-80_000, "RENT", 15);
  await row(-12_345, "CORNER MARKET", 5);
});

// Each test starts with nothing asked today.
beforeEach(async () => {
  await db
    .delete(summaryWrite)
    .where(inArray(summaryWrite.userId, [viewer, editor, stranger]));
  signIn(viewer);
});

afterAll(async () => {
  await f.cleanUp();
});

describe("loadSummaryPanel", () => {
  it("builds the panel from this workspace's figures, without a model", async () => {
    const facts = await getSummary(workspace, NOW);

    const panel = await loadSummaryPanel(workspace, NOW);

    expect(facts.values.owed_total).toBe("$250.00");
    expect(panel?.remaining).toBe(DAILY_WRITES);
    expect(panel?.view.source).toBe("code");
    expect(panel?.view.summary).toContain(
      `You have ${facts.values.cash_total} in checking and savings and owe $250.00 on cards and loans.`,
    );
    // Every label was filled in.
    expect(
      [panel?.view.summary, ...(panel?.view.suggestions ?? [])].join(" "),
    ).not.toMatch(/[{}]/);
  });

  it("has no panel for a workspace without accounts", async () => {
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

  it("shows what Gemini wrote today to every member, and each their own count", async () => {
    await writeSummary(workspace, { generate: generating(GOOD), now: NOW });

    const mine = await loadSummaryPanel(workspace, NOW);
    signIn(editor);
    const theirs = await loadSummaryPanel(workspace, NOW);

    expect(mine?.view).toMatchObject({
      source: "model",
      summary: expect.stringMatching(
        /^You have \$[\d,.]+ and owe \$250\.00\.$/,
      ),
    });
    expect(mine?.view.writtenAt).toMatch(/^\d{1,2}:\d{2}\s[AP]M$/);
    expect(mine?.remaining).toBe(DAILY_WRITES - 1);
    expect(theirs?.view).toEqual(mine?.view);
    expect(theirs?.remaining).toBe(DAILY_WRITES);
  });

  it("fills a stored summary with the figures as they are now", async () => {
    const mine = await f.newWorkspace({ [viewer]: "viewer" });
    await checking(mine, 10_000);
    await writeSummary(mine, {
      generate: generating({ summary: "Cash: {cash_total}.", suggestions: [] }),
      now: NOW,
    });
    expect((await loadSummaryPanel(mine, NOW))?.view.summary).toBe(
      "Cash: $100.00.",
    );

    await checking(mine, 2_550);

    expect((await loadSummaryPanel(mine, NOW))?.view).toMatchObject({
      source: "model",
      summary: "Cash: $125.50.",
    });
  });

  it("keeps the labels, never a figure, in what it stores", async () => {
    await writeSummary(workspace, { generate: generating(GOOD), now: NOW });

    const [row] = await rowsFor(workspace);

    expect(row?.userId).toBe(viewer);
    expect(row?.draft).toEqual(GOOD);
    expect(hasOwnDigits(JSON.stringify(row?.draft))).toBe(false);
  });

  it.each([
    ["uses a figure that is no longer there", { ...GOOD, summary: "{gone}." }],
    ["holds a digit", { ...GOOD, summary: "You have $5,000." }],
    ["is not the shape a draft has", { summary: 5 }],
  ])(
    "shows the code-built panel when the stored draft %s",
    async (_case, draft) => {
      await db.insert(summaryWrite).values({
        workspaceId: workspace,
        userId: viewer,
        writtenOn: TODAY,
        // Whatever is in the column is checked again before it is shown.
        draft: draft as never,
      });

      const panel = await loadSummaryPanel(workspace, NOW);

      expect(panel?.view.source).toBe("code");
      expect(panel?.view.summary).toContain("in checking and savings");
    },
  );

  it("goes back to the code-built panel the next day", async () => {
    await writeSummary(workspace, { generate: generating(GOOD), now: NOW });

    const panel = await loadSummaryPanel(workspace, TOMORROW);

    expect(panel?.view.source).toBe("code");
    expect(panel?.remaining).toBe(DAILY_WRITES);
  });

  it("never shows another workspace's summary", async () => {
    await writeSummary(workspace, { generate: generating(GOOD), now: NOW });

    const panel = await loadSummaryPanel(other, NOW);

    expect(panel?.view.source).toBe("code");
    expect(panel?.view.summary).toContain("You have $700.00");
  });
});

describe("writeSummary", () => {
  it("fills a model's draft with this workspace's figures", async () => {
    const facts = await getSummary(workspace, NOW);

    const result = await writeSummary(workspace, {
      generate: generating(GOOD),
      now: NOW,
    });

    expect(result).toMatchObject({
      outcome: "written",
      remaining: DAILY_WRITES - 1,
      view: {
        source: "model",
        summary: `You have ${facts.values.cash_total} and owe $250.00.`,
        suggestions: [`About ${facts.values.spending} goes out a month.`],
      },
    });
    expect(result?.view.writtenAt).toMatch(/^\d{1,2}:\d{2}\s[AP]M$/);
  });

  it("sends the model labels and the shape, never a figure", async () => {
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
    "keeps the code-built panel, stores nothing and counts the try when the answer %s",
    async (_case, answer) => {
      const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
      const built = await loadSummaryPanel(workspace, NOW);

      const result = await writeSummary(workspace, {
        generate: generating(answer),
        now: NOW,
      });

      expect(result).toEqual({
        outcome: "no_answer",
        remaining: DAILY_WRITES - 1,
        view: built?.view,
      });
      expect((await rowsFor(workspace)).map((row) => row.draft)).toEqual([
        null,
      ]);
      // The log names the reason, never the draft.
      expect(JSON.stringify(warned.mock.calls)).not.toContain("You have");
      warned.mockRestore();
    },
  );

  it("keeps the code-built panel when no model answers or the call fails", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const built = await loadSummaryPanel(workspace, NOW);

    for (const failure of [new AiUnavailableError([]), new Error("network")]) {
      const result = await writeSummary(workspace, {
        generate: vi.fn(async () => {
          throw failure;
        }),
        now: NOW,
      });
      expect(result).toMatchObject({ outcome: "no_answer", view: built?.view });
    }
    // No key is set under test, so this is the real, key-less path.
    expect(await writeSummary(workspace, { now: NOW })).toMatchObject({
      outcome: "no_answer",
      remaining: DAILY_WRITES - 3,
      view: built?.view,
    });
    warned.mockRestore();
  });

  it("keeps an earlier summary on show when a later try gets no answer", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = await writeSummary(workspace, {
      generate: generating(GOOD),
      now: NOW,
    });

    const second = await writeSummary(workspace, {
      generate: generating("not json"),
      now: NOW,
    });

    expect(second).toMatchObject({
      outcome: "no_answer",
      remaining: DAILY_WRITES - 2,
      view: { source: "model", summary: first?.view.summary },
    });
    warned.mockRestore();
  });

  it("stops at the daily limit without asking a model, for that person only", async () => {
    const generate = generating(GOOD);
    for (let asked = 0; asked < DAILY_WRITES; asked += 1) {
      await writeSummary(workspace, { generate, now: NOW });
    }

    const refused = await writeSummary(workspace, { generate, now: NOW });
    // Their limit is theirs in every workspace.
    const elsewhere = await writeSummary(other, { generate, now: NOW });

    expect(generate).toHaveBeenCalledTimes(DAILY_WRITES);
    expect(refused).toMatchObject({
      outcome: "limit",
      remaining: 0,
      view: { source: "model" },
    });
    expect(elsewhere).toMatchObject({ outcome: "limit", remaining: 0 });
    expect((await loadSummaryPanel(workspace, NOW))?.remaining).toBe(0);

    signIn(editor);
    expect(await writeSummary(workspace, { generate, now: NOW })).toMatchObject(
      { outcome: "written", remaining: DAILY_WRITES - 1 },
    );
  });

  it("never lets clicks at the same moment pass the limit", async () => {
    const generate = generating(GOOD);

    const results = await Promise.all(
      Array.from({ length: DAILY_WRITES + 3 }, () =>
        writeSummary(workspace, { generate, now: NOW }),
      ),
    );

    expect(generate).toHaveBeenCalledTimes(DAILY_WRITES);
    expect(
      results.filter((result) => result?.outcome === "limit"),
    ).toHaveLength(3);
    expect(await rowsFor(workspace)).toHaveLength(DAILY_WRITES);
  });

  it("starts again the next day and clears the day before", async () => {
    const generate = generating(GOOD);
    for (let asked = 0; asked < DAILY_WRITES; asked += 1) {
      await writeSummary(workspace, { generate, now: NOW });
    }

    const result = await writeSummary(workspace, { generate, now: TOMORROW });

    expect(result).toMatchObject({
      outcome: "written",
      remaining: DAILY_WRITES - 1,
    });
    expect(await rowsFor(workspace)).toHaveLength(1);
  });

  it("asks no model and takes no try for a workspace without accounts", async () => {
    const generate = generating(GOOD);

    expect(await writeSummary(empty, { generate, now: NOW })).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    expect(await rowsFor(empty)).toEqual([]);
  });

  it("is not found for someone who is not a member, and asks no model", async () => {
    signIn(stranger);
    const generate = generating(GOOD);

    await expect(
      writeSummary(workspace, { generate, now: NOW }),
    ).rejects.toSatisfy(isNotFound);
    expect(generate).not.toHaveBeenCalled();
    expect(await rowsFor(workspace)).toEqual([]);
  });
});
