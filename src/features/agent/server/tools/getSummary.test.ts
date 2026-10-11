import { afterAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn } from "@/features/accounts";
import { createAccount } from "@/features/accounts/server/repository";
import { formatLong, loadCashflowData, summarize } from "@/features/cashflow";
import { savePayment } from "@/features/recurring/server/repository";
import { cents, formatCents } from "@/lib/money";
import { fixtures } from "../../../../../tests/support/db-fixtures";
import { answer } from "../answer";
import { getSummary } from "./getSummary";

// Integration tests against the Docker database (TEST-05): the agent's
// figures for the days until payday must be the calendar's own (ADR-042),
// so each is compared with the same call the dashboard makes.

const f = fixtures();
const NOW = new Date();
const TODAY = isoDateIn(NOW, DEFAULT_TIME_ZONE);
const inDays = (days: number): string =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** A workspace with $2,000.00 in checking and nothing else. */
async function workspaceWithChecking() {
  const userId = await f.newUser();
  const workspaceId = await f.newWorkspace({ [userId]: "owner" });
  const accountId = await createAccount(workspaceId, {
    type: "checking",
    institutionName: "Test Bank",
    nickname: "Everyday",
    maskLast4: null,
    balanceCents: cents(200_000),
  });
  const confirm = async (
    merchant: string,
    kind: "income" | "bill",
    amountCents: number,
    nextOn: string,
  ) =>
    expect(
      await savePayment(workspaceId, {
        accountId,
        merchant,
        name: merchant,
        kind,
        amountMode: "fixed",
        unit: "months",
        every: 1,
        amountCents,
        nextOn,
        useHistory: false,
      }),
    ).toBe("ok");
  return { workspaceId, confirm };
}

afterAll(async () => {
  await f.cleanUp();
});

describe("getSummary: the days until payday", () => {
  it("gives the calendar's own figures for a confirmed payday and bills", async () => {
    const { workspaceId, confirm } = await workspaceWithChecking();
    await confirm("acme payroll", "income", 145_000, inDays(7));
    await confirm("rent", "bill", 80_000, inDays(3));
    // After payday, so it is not owed out of today's balance.
    await confirm("car insurance", "bill", 12_000, inDays(10));

    const facts = await getSummary(workspaceId, NOW);
    const { data, today } = await loadCashflowData(workspaceId, NOW);
    const calendar = summarize(data, today);

    expect(facts.payday).toBe("per_day");
    expect(facts.values).toMatchObject({
      cash_total: "$2,000.00",
      payday_date: formatLong(inDays(7)),
      days_until_payday: "7 days",
      due_before_payday: "$800.00",
      due_count: "1 payment",
      free_to_spend: "$1,200.00",
      per_day: "$171.42",
    });
    // The same figures the dashboard's headline is drawn from.
    expect(facts.values.cash_total).toBe(formatCents(calendar.balanceToday));
    expect(facts.values.due_before_payday).toBe(formatCents(calendar.dueTotal));
    expect(facts.values.free_to_spend).toBe(formatCents(calendar.freeToSpend));
    expect(facts.values.per_day).toBe(formatCents(calendar.perDay));
  });

  it("answers with those figures when no model does", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { workspaceId, confirm } = await workspaceWithChecking();
    await confirm("acme payroll", "income", 145_000, inDays(7));
    await confirm("rent", "bill", 80_000, inDays(3));

    // No key is set under test, so this is the real, key-less path.
    const reply = await answer("how am I doing?", workspaceId, { now: NOW });

    expect(reply).toBe(
      `You have $2,000.00 in checking and savings. $800.00 is due before your next payday on ${formatLong(inDays(7))}, 7 days away. That leaves $171.42 a day until then.`,
    );
    warned.mockRestore();
  });

  it("gives no per-day figure when bills use all of today's balance", async () => {
    const { workspaceId, confirm } = await workspaceWithChecking();
    await confirm("acme payroll", "income", 145_000, inDays(5));
    await confirm("rent", "bill", 250_000, inDays(2));

    const facts = await getSummary(workspaceId, NOW);

    expect(facts.payday).toBe("all_used");
    expect(facts.values.due_before_payday).toBe("$2,500.00");
    expect(facts.values.per_day).toBeUndefined();
  });

  it("has no payday figures until a payday is confirmed", async () => {
    const { workspaceId, confirm } = await workspaceWithChecking();
    await confirm("rent", "bill", 80_000, inDays(3));

    const facts = await getSummary(workspaceId, NOW);

    expect(facts.payday).toBe("none");
    expect(facts.values.cash_total).toBe("$2,000.00");
    expect(facts.values.per_day).toBeUndefined();
    expect(facts.values.payday_date).toBeUndefined();
  });

  it("never gives one workspace another's payday", async () => {
    const mine = await workspaceWithChecking();
    const theirs = await workspaceWithChecking();
    await theirs.confirm("acme payroll", "income", 145_000, inDays(7));

    expect((await getSummary(mine.workspaceId, NOW)).payday).toBe("none");
    expect((await getSummary(theirs.workspaceId, NOW)).payday).toBe("per_day");
  });
});
