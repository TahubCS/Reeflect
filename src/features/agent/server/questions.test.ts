import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn, listAccounts } from "@/features/accounts";
import { createAccount } from "@/features/accounts/server/repository";
import { readBudgetMonth } from "@/features/budgets";
import { formatLong, loadCashflowData, summarize } from "@/features/cashflow";
import { ensureCategories, listCategories } from "@/features/categorization";
import { savePayment } from "@/features/recurring/server/repository";
import { hasOwnDigits } from "@/lib/ai/digitScan";
import { withoutLabels } from "@/lib/ai/fill";
import type { AiRequest } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { budget } from "@/lib/db/schema";
import { absolute, cents, formatCents } from "@/lib/money";
import { fixtures } from "../../../../tests/support/db-fixtures";
import { parseLog } from "../domain/log";
import { valuesOf } from "../domain/summary";
import { answer } from "./answer";
import { getSummary } from "./tools/getSummary";
import { logSpending } from "./tools/logSpending";

// Integration tests against the Docker database (TEST-05) for F-28: the
// agent's category, budget, payment and account figures must be the ones
// the Budgets page, the calendar and the accounts list are drawn from, so
// each is compared with the call that page makes.

// The real read, wrapped so one test can make it fail.
vi.mock("@/features/budgets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/budgets")>();
  return { ...actual, readBudgetMonth: vi.fn(actual.readBudgetMonth) };
});

const f = fixtures();
const NOW = new Date();
const TODAY = isoDateIn(NOW, DEFAULT_TIME_ZONE);
const MONTH = TODAY.slice(0, 7);
const inDays = (days: number): string =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

type Kind = "checking" | "savings" | "credit_card" | "loan";

async function workspace() {
  const userId = await f.newUser();
  const workspaceId = await f.newWorkspace({ [userId]: "owner" });
  await ensureCategories(workspaceId);
  const account = (type: Kind, nickname: string, balance: number) =>
    createAccount(workspaceId, {
      type,
      institutionName: "Test Bank",
      nickname,
      maskLast4: null,
      balanceCents: cents(balance),
    });
  const setBudget = async (presetKey: string, amountCents: number) => {
    const category = (await listCategories(workspaceId)).find(
      (candidate) => candidate.presetKey === presetKey,
    )!;
    await db.insert(budget).values({
      workspaceId,
      month: MONTH,
      categoryId: category.id,
      amountCents,
    });
  };
  /** Logs spending as a text from a linked phone would (F-27). */
  const text = async (message: string) => {
    const command = parseLog(message);
    if (command.type === "none") throw new Error(`not a log: ${message}`);
    const reply = await logSpending(command, {
      workspaceId,
      identityId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      now: NOW,
      generate: async () => {
        throw new Error("no model in this test");
      },
    });
    expect(reply).toContain("Logged");
  };
  const confirm = async (
    accountId: string,
    name: string,
    kind: "income" | "bill",
    amountCents: number,
    nextOn: string,
  ) =>
    expect(
      await savePayment(workspaceId, {
        accountId,
        merchant: name.toLowerCase(),
        name,
        kind,
        amountMode: "fixed",
        unit: "months",
        every: 1,
        amountCents,
        nextOn,
        useHistory: false,
      }),
    ).toBe("ok");
  return { workspaceId, account, setBudget, text, confirm };
}

const generating = (draft: string) =>
  vi.fn<(request: AiRequest) => Promise<string>>(async () => draft);

/** No key is set under test, so this is the real, key-less path. */
const codeBuilt = (message: string, workspaceId: string) =>
  answer(message, workspaceId, { now: NOW });

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await f.cleanUp();
});

describe("this month's categories and budgets", () => {
  it("gives the Budgets page's own figures, with what was just texted in", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { workspaceId, account, setBudget, text } = await workspace();
    await account("checking", "Everyday", 200_000);
    await setBudget("groceries", 50_000);
    await setBudget("dining", 1_000);
    await text("40 groceries");
    await text("12 lunch");

    const facts = await getSummary(workspaceId, NOW);
    const month = await readBudgetMonth(workspaceId, MONTH, TODAY);
    const values = valuesOf(facts);

    expect(facts.categories).toEqual([
      { name: "Groceries", budget: "left" },
      { name: "Dining", budget: "over" },
    ]);
    facts.categories.forEach(({ name }, index) => {
      const row = month.rows.find((candidate) => candidate.name === name)!;
      const label = `category_${index + 1}`;
      expect(values[`${label}_spent`]).toBe(formatCents(row.spent));
      expect(values[`${label}_budget`]).toBe(formatCents(row.allocation!));
      expect(values[`${label}_left`] ?? values[`${label}_over`]).toBe(
        formatCents(absolute(row.remaining!)),
      );
    });
    expect(values).toMatchObject({
      category_1_spent: "$40.00",
      category_1_left: "$460.00",
      category_2_spent: "$12.00",
      category_2_over: "$2.00",
    });
    expect(values.month_spent).toBe(formatCents(month.totals.totalSpending));
    expect(values.month_spent).toBe("$52.00");

    expect(
      await codeBuilt("whats left in my grocries budget", workspaceId),
    ).toBe(
      "You've spent $40.00 on Groceries so far this month. You have $460.00 left of your $500.00 Groceries budget this month.",
    );
    expect(await codeBuilt("how much did I spend on food?", workspaceId)).toBe(
      "You've spent $40.00 on Groceries and $12.00 on Dining so far this month. You have $460.00 left of your $500.00 Groceries budget this month. That is $2.00 over your $10.00 Dining budget this month.",
    );
  });

  it("fills a model's draft, and drops one that does not say this month", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { workspaceId, account, text } = await workspace();
    await account("checking", "Everyday", 200_000);
    await text("40 groceries");

    expect(
      await answer("how much on groceries?", workspaceId, {
        generate: generating(
          "So far this month, {category_1_spent} went on {category_1_name}.",
        ),
        now: NOW,
      }),
    ).toBe("So far this month, $40.00 went on Groceries.");
    expect(warned).not.toHaveBeenCalled();

    expect(
      await answer("how much on groceries?", workspaceId, {
        generate: generating("You spend {category_1_spent} on groceries."),
        now: NOW,
      }),
    ).toBe("You've spent $40.00 on Groceries so far this month.");
    expect(warned).toHaveBeenCalledWith("agent: draft rejected", {
      reason: "month_to_date_not_called_this_month",
    });
  });

  it("still answers when the month cannot be read", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { workspaceId, account, text } = await workspace();
    await account("checking", "Everyday", 200_000);
    // Logged while there is one account, so the text need not name it.
    await text("40 groceries");
    await account("savings", "Rainy Day", 400_000);
    vi.mocked(readBudgetMonth).mockRejectedValueOnce(new TypeError("boom"));

    const facts = await getSummary(workspaceId, NOW);

    expect(facts.categories).toEqual([]);
    expect(facts.values.month_spent).toBeUndefined();
    expect(Object.keys(facts.described).join(" ")).not.toContain("category");
    expect(facts.values.cash_total).toBe("$5,960.00");
    expect(facts.accounts).toHaveLength(2);
    // The workspace and the error's name: never its message.
    expect(warned).toHaveBeenCalledWith("agent: budget month not read", {
      workspaceId,
      reason: "TypeError",
    });

    vi.mocked(readBudgetMonth).mockRejectedValueOnce(new TypeError("boom"));
    expect(await codeBuilt("how much on groceries?", workspaceId)).toMatch(
      /^You have \$5,960\.00 in checking and savings\./,
    );
    vi.mocked(readBudgetMonth).mockRejectedValueOnce(new TypeError("boom"));
    expect(await codeBuilt("what's in my savings?", workspaceId)).toBe(
      "Your savings account, Rainy Day, has $4,000.00.",
    );
  });
});

describe("upcoming payments", () => {
  it("gives the calendar's own, soonest first", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { workspaceId, account, confirm } = await workspace();
    const checking = await account("checking", "Everyday", 200_000);
    await confirm(checking, "Acme Payroll", "income", 145_000, inDays(7));
    await confirm(checking, "Streamly", "bill", 1_599, inDays(5));
    await confirm(checking, "Maple Flats", "bill", 80_000, inDays(3));
    // After payday, so it is not among them.
    await confirm(checking, "Car Insurance", "bill", 12_000, inDays(10));

    const facts = await getSummary(workspaceId, NOW);
    const { data, today } = await loadCashflowData(workspaceId, NOW);
    const { dueBeforePayday, dueTotal } = summarize(data, today);

    expect(dueBeforePayday).toHaveLength(2);
    dueBeforePayday.forEach((item, index) => {
      const rank = (index + 1) as 1 | 2;
      expect(facts.values[`due_${rank}_name`]).toBe(item.name);
      expect(facts.values[`due_${rank}_amount`]).toBe(
        formatCents(absolute(item.amount)),
      );
      expect(facts.values[`due_${rank}_date`]).toBe(formatLong(item.date));
    });
    expect(facts.values).toMatchObject({
      due_1_amount: "$800.00",
      due_1_date: formatLong(inDays(3)),
      due_2_amount: "$15.99",
      due_2_date: formatLong(inDays(5)),
      due_before_payday: formatCents(dueTotal),
    });
    expect(facts.values.due_3_name).toBeUndefined();

    const [first, second] = dueBeforePayday;
    expect(await codeBuilt("what bills are coming up?", workspaceId)).toBe(
      `${first!.name} ($800.00) is due ${formatLong(inDays(3))}, and ${second!.name} ($15.99) on ${formatLong(inDays(5))}. $815.99 is due in all before your next payday.`,
    );
  });

  it("says nothing is due, or to confirm a payday, when that is so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { workspaceId, account, confirm } = await workspace();
    const checking = await account("checking", "Everyday", 200_000);

    expect(await codeBuilt("what bills are coming up?", workspaceId)).toBe(
      "Confirm your payday on the website's Recurring payments page and I can tell you what you can spend a day.",
    );

    await confirm(checking, "Acme Payroll", "income", 145_000, inDays(7));
    expect(await codeBuilt("what bills are coming up?", workspaceId)).toBe(
      `Nothing is due before your next payday on ${formatLong(inDays(7))}.`,
    );
  });
});

describe("accounts", () => {
  it("gives each stored balance, and a card's as what is owed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { workspaceId, account } = await workspace();
    await account("checking", "Everyday", 150_025);
    await account("savings", "Rainy Day", 400_000);
    await account("credit_card", "Quicksilver", -32_010);

    const facts = await getSummary(workspaceId, NOW);
    const stored = await listAccounts(workspaceId);
    const values = valuesOf(facts);

    expect(stored).toHaveLength(3);
    stored.forEach((row, index) => {
      expect(values[`account_${index + 1}_name`]).toBe(row.nickname);
      expect(values[`account_${index + 1}_balance`]).toBe(
        formatCents(
          row.type === "credit_card"
            ? absolute(row.balanceCents)
            : row.balanceCents,
        ),
      );
    });
    expect(values.account_3_balance).toBe("$320.10");

    expect(await codeBuilt("what's in my savings?", workspaceId)).toBe(
      "Your savings account, Rainy Day, has $4,000.00.",
    );
    expect(await codeBuilt("how much is on my card?", workspaceId)).toBe(
      "You owe $320.10 on your credit card, Quicksilver.",
    );
  });
});

describe("one workspace at a time", () => {
  it("never gets another's categories, payments or accounts", async () => {
    const mine = await workspace();
    await mine.account("checking", "Everyday", 111_100);
    await mine.text("40 groceries");
    const theirs = await workspace();
    const theirChecking = await theirs.account("checking", "Theirs", 999_900);
    await theirs.setBudget("dining", 30_000);
    await theirs.text("12 lunch");
    await theirs.account("savings", "Nest Egg", 500_000);
    await theirs.confirm(
      theirChecking,
      "Acme Payroll",
      "income",
      145_000,
      inDays(7),
    );
    await theirs.confirm(
      theirChecking,
      "Maple Flats",
      "bill",
      80_000,
      inDays(3),
    );

    const facts = await getSummary(mine.workspaceId, NOW);

    expect(facts.categories).toEqual([{ name: "Groceries", budget: "none" }]);
    expect(facts.accounts).toEqual([{ name: "Everyday", kind: "checking" }]);
    expect(facts.payday).toBe("none");
    const values = valuesOf(facts);
    expect(values).toMatchObject({
      cash_total: "$1,071.00",
      month_spent: "$40.00",
      category_1_name: "Groceries",
      category_1_spent: "$40.00",
      account_1_name: "Everyday",
      account_1_balance: "$1,071.00",
    });
    expect(
      Object.keys(values).filter((label) =>
        /^(category|account|due)_/.test(label),
      ),
    ).toEqual([
      "category_1_name",
      "category_1_spent",
      "account_1_name",
      "account_1_balance",
    ]);
    for (const theirValue of ["Theirs", "Nest Egg", "Dining", "$300.00"]) {
      expect(Object.values(values)).not.toContain(theirValue);
    }
    // And theirs holds nothing of mine.
    const other = valuesOf(await getSummary(theirs.workspaceId, NOW));
    expect(other.category_1_name).toBe("Dining");
    expect(other.category_2_name).toBeUndefined();
    expect(Object.values(other)).not.toContain("Everyday");
    expect(other.due_1_name).toBeDefined();
  });
});

describe("what the model is sent", () => {
  it("holds labels and descriptions, never a figure or an account's name", async () => {
    const { workspaceId, account, setBudget, text, confirm } =
      await workspace();
    const checking = await account("checking", "Everyday", 200_000);
    await account("savings", "Rainy Day", 400_000);
    await account("credit_card", "Quicksilver", -32_010);
    await setBudget("groceries", 50_000);
    await text("40 groceries from Everyday");
    await confirm(checking, "Acme Payroll", "income", 145_000, inDays(7));
    await confirm(checking, "Maple Flats", "bill", 80_000, inDays(3));
    const facts = await getSummary(workspaceId, NOW);
    const generate = generating("You have {cash_total}.");

    await answer("whats left for groceries?", workspaceId, {
      generate,
      now: NOW,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    const sent = generate.mock.calls[0]![0];
    const all = `${sent.system}\n${sent.user}`;
    for (const label of [
      "category_1_spent",
      "category_1_left",
      "month_spent",
      "due_1_name",
      "due_1_amount",
      "due_1_date",
      "account_2_name",
      "account_3_balance",
    ]) {
      expect(sent.user).toContain(`{${label}}: `);
    }
    expect(sent.user).toContain(
      "{category_1_left}: exactly what is left of their Groceries budget this month",
    );
    // Label names hold digits ({category_1_spent}), so look outside them.
    const outsideLabels = withoutLabels(all);
    for (const [label, value] of Object.entries(valuesOf(facts))) {
      // A category's name is what its description is for.
      if (/^category_[0-9]+_name$/.test(label)) continue;
      expect(outsideLabels).not.toContain(value);
    }
    for (const nickname of ["Everyday", "Rainy Day", "Quicksilver"]) {
      expect(outsideLabels).not.toContain(nickname);
    }
    expect(outsideLabels).not.toContain("Maple Flats");
    expect(hasOwnDigits(all)).toBe(false);
  });
});
