import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { markBillPaid } from "@/features/bills";
import {
  listRecurringPayments,
  savePayment,
} from "@/features/recurring/server/repository";
import {
  setAlertTypes,
  setQuietHours,
} from "@/features/messaging/server/notifications";
import { db } from "@/lib/db/client";
import {
  financialAccount,
  messagingIdentity,
  proactiveMessage,
  transaction,
} from "@/lib/db/schema";
import { fixtures } from "../../../../tests/support/db-fixtures";
import { MAX_ATTEMPTS } from "./outbox";
import { ALERT_REPLIES, alertReplyTurn } from "./replies";
import { runAlertsTick } from "./tick";

// Integration tests against the Docker database (TEST-05) for F-22 and
// F-26 (ADR-038, ADR-105): what gets queued, when it is sent, what it says,
// and what a reply does. Sending goes to a fake that records the texts.

const f = fixtures();
const workspaces: string[] = [];
// Sunday, October 11, 2026, noon in New York.
const NOW = new Date("2026-10-11T16:00:00Z");
const MONEY = /[$¢€£]|\d+\.\d{2}\b/;

/** Letters only, so a name never holds a digit (see safeName). */
const word = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) =>
    String.fromCharCode(97 + (n % 26)),
  ).join("");

type Sent = { spaceId: string; text: string };

function recorder(ok = true) {
  const sent: Sent[] = [];
  const send = vi.fn(
    async (_platform: string, spaceId: string, text: string) => {
      sent.push({ spaceId, text });
      return ok;
    },
  );
  return { sent, send };
}

async function linkedWorkspace(
  options: { optIn?: boolean; balance?: number } = {},
) {
  const userId = await f.newUser();
  const workspaceId = await f.newWorkspace({ [userId]: "owner" });
  workspaces.push(workspaceId);
  const [account] = await db
    .insert(financialAccount)
    .values({
      workspaceId,
      institutionName: "Synthetic bank",
      nickname: "Everyday",
      type: "checking",
      source: "synthetic",
      currentBalanceCents: options.balance ?? 500_000,
    })
    .returning();
  const spaceId = `space-${crypto.randomUUID()}`;
  const [identity] = await db
    .insert(messagingIdentity)
    .values({
      userId,
      workspaceId,
      platform: "terminal",
      handle: `test-${crypto.randomUUID()}`,
      spaceId,
      verifiedAt: NOW,
      proactiveOptIn: options.optIn ?? true,
    })
    .returning();
  const accountId = account!.id;

  /** Three monthly charges: code suggests it as a subscription. */
  const subscription = async (amountCents = -1549) => {
    const merchant = `Stream ${word()}`;
    await db.insert(transaction).values(
      ["2026-08-01", "2026-09-01", "2026-10-01"].map((postedOn) => ({
        workspaceId,
        financialAccountId: accountId,
        amountCents,
        postedOn,
        descriptionRaw: merchant,
        source: "csv" as const,
        fingerprint: crypto.randomUUID(),
      })),
    );
    const { payments } = await listRecurringPayments(workspaceId, NOW);
    const found = payments.find((p) => p.decision === "candidate");
    if (!found || found.kind !== "subscription") {
      throw new Error("the fixture was not suggested as a subscription");
    }
    return found;
  };

  /** A bill the user added, due `nextOn`. */
  const bill = async (nextOn: string, amountCents = 32_000) => {
    const name = `Loan ${word()}`;
    const merchant = name.toLowerCase();
    expect(
      await savePayment(workspaceId, {
        accountId,
        merchant,
        name,
        kind: "bill",
        amountMode: "fixed",
        unit: "months",
        every: 1,
        amountCents,
        nextOn,
        useHistory: false,
      }),
    ).toBe("ok");
    return { name, merchant };
  };

  return {
    userId,
    workspaceId,
    accountId,
    spaceId,
    identity: {
      identityId: identity!.id,
      userId,
      workspaceId,
    },
    subscription,
    bill,
  };
}

const rowsOf = (workspaceId: string) =>
  db
    .select()
    .from(proactiveMessage)
    .where(eq(proactiveMessage.workspaceId, workspaceId));

const textsTo = (sent: Sent[], spaceId: string) =>
  sent.filter((s) => s.spaceId === spaceId).map((s) => s.text);

afterEach(async () => {
  // Rows from one test must not be sent by the next test's tick.
  if (workspaces.length > 0) {
    await db
      .delete(proactiveMessage)
      .where(inArray(proactiveMessage.workspaceId, workspaces));
  }
});

afterAll(async () => {
  await f.cleanUp();
});

describe("the alerts tick", () => {
  it("texts a new subscription and a bill due this week, without amounts", async () => {
    const w = await linkedWorkspace();
    const sub = await w.subscription();
    const loan = await w.bill("2026-10-16");
    const { sent, send } = recorder();

    await runAlertsTick(NOW, send);

    const texts = textsTo(sent, w.spaceId);
    expect(texts).toHaveLength(2);
    expect(texts.find((t) => t.includes("subscription"))).toContain(sub.name);
    expect(texts.find((t) => t.includes("bill"))).toBe(
      `Your ${loan.name} bill is due on Friday, October 16. Reply DETAILS to see the amount.`,
    );
    for (const text of texts) expect(text).not.toMatch(MONEY);
    expect((await rowsOf(w.workspaceId)).map((r) => r.status)).toEqual([
      "sent",
      "sent",
    ]);
  });

  it("texts each subject once, however often it runs", async () => {
    const w = await linkedWorkspace();
    await w.subscription();
    const { sent, send } = recorder();

    await runAlertsTick(NOW, send);
    await runAlertsTick(new Date(NOW.getTime() + 5 * 60_000), send);

    expect(textsTo(sent, w.spaceId)).toHaveLength(1);
    expect(await rowsOf(w.workspaceId)).toHaveLength(1);
  });

  it("leaves out bills that are paid, past or more than a week away", async () => {
    const w = await linkedWorkspace();
    await w.bill("2026-10-19"); // eight days
    const paid = await w.bill("2026-10-13");
    expect(
      await markBillPaid(
        w.workspaceId,
        { accountId: w.accountId, merchant: paid.merchant },
        "2026-10-13",
        0,
        true,
        NOW,
      ),
    ).toBe("ok");
    const { sent, send } = recorder();

    await runAlertsTick(NOW, send);

    expect(textsTo(sent, w.spaceId)).toEqual([]);
    expect(await rowsOf(w.workspaceId)).toEqual([]);
  });

  it("texts no one who has not opted in, and respects each type's switch", async () => {
    const quiet = await linkedWorkspace({ optIn: false });
    await quiet.subscription();
    const billsOnly = await linkedWorkspace();
    await billsOnly.subscription();
    await billsOnly.bill("2026-10-14");
    await setAlertTypes(billsOnly.userId, {
      subscriptionAlerts: false,
      billReminders: true,
    });
    const { sent, send } = recorder();

    await runAlertsTick(NOW, send);

    expect(textsTo(sent, quiet.spaceId)).toEqual([]);
    expect(await rowsOf(quiet.workspaceId)).toEqual([]);
    const texts = textsTo(sent, billsOnly.spaceId);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("bill is due on Wednesday, October 14");
  });

  it("holds a text through quiet hours and sends it when they end", async () => {
    const w = await linkedWorkspace();
    await w.subscription();
    const late = new Date("2026-10-12T02:30:00Z"); // 10:30 PM EDT
    const { sent, send } = recorder();

    await runAlertsTick(late, send);

    expect(textsTo(sent, w.spaceId)).toEqual([]);
    const [row] = await rowsOf(w.workspaceId);
    expect(row!.status).toBe("queued");
    expect(row!.notBefore).toEqual(new Date("2026-10-12T13:00:00Z"));

    await runAlertsTick(new Date("2026-10-12T13:00:00Z"), send);
    expect(textsTo(sent, w.spaceId)).toHaveLength(1);
  });

  it("uses the user's own quiet hours", async () => {
    const w = await linkedWorkspace();
    await w.subscription();
    await setQuietHours(w.userId, { startMinute: 11 * 60, endMinute: 13 * 60 });
    const { sent, send } = recorder();

    await runAlertsTick(NOW, send);

    expect(textsTo(sent, w.spaceId)).toEqual([]);
    expect((await rowsOf(w.workspaceId))[0]!.notBefore).toEqual(
      new Date("2026-10-11T17:00:00Z"), // 1 PM EDT
    );
  });

  it("sends at most three a day and keeps the fourth for tomorrow", async () => {
    const w = await linkedWorkspace();
    for (const day of [
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]) {
      await w.bill(day);
    }
    const { sent, send } = recorder();

    await runAlertsTick(NOW, send);

    expect(textsTo(sent, w.spaceId)).toHaveLength(3);
    const waiting = (await rowsOf(w.workspaceId)).filter(
      (r) => r.status === "queued",
    );
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.notBefore).toEqual(new Date("2026-10-12T13:00:00Z"));
  });

  it("does not send a reminder for a bill paid after it was queued", async () => {
    const w = await linkedWorkspace();
    const loan = await w.bill("2026-10-14");
    await setQuietHours(w.userId, { startMinute: 11 * 60, endMinute: 13 * 60 });
    const { sent, send } = recorder();
    await runAlertsTick(NOW, send);
    await markBillPaid(
      w.workspaceId,
      { accountId: w.accountId, merchant: loan.merchant },
      "2026-10-14",
      0,
      true,
      NOW,
    );

    await runAlertsTick(new Date("2026-10-11T17:00:00Z"), send);

    expect(textsTo(sent, w.spaceId)).toEqual([]);
    expect((await rowsOf(w.workspaceId))[0]!.status).toBe("cancelled");
  });

  it("cancels a queued text once the phone is unlinked", async () => {
    const w = await linkedWorkspace();
    await w.subscription();
    await setQuietHours(w.userId, { startMinute: 11 * 60, endMinute: 13 * 60 });
    const { sent, send } = recorder();
    await runAlertsTick(NOW, send);
    await db
      .update(messagingIdentity)
      .set({ revokedAt: NOW })
      .where(eq(messagingIdentity.id, w.identity.identityId));

    await runAlertsTick(new Date("2026-10-11T17:00:00Z"), send);

    expect(textsTo(sent, w.spaceId)).toEqual([]);
    expect((await rowsOf(w.workspaceId))[0]!.status).toBe("cancelled");
  });

  it("retries a failed send, then gives up", async () => {
    const w = await linkedWorkspace();
    await w.subscription();
    const { send } = recorder(false);
    let at = NOW.getTime();

    for (let i = 0; i < MAX_ATTEMPTS + 1; i += 1) {
      await runAlertsTick(new Date(at), send);
      at += 5 * 60_000;
    }

    const [row] = await rowsOf(w.workspaceId);
    expect(row!.status).toBe("failed");
    expect(row!.attempts).toBe(MAX_ATTEMPTS);
    expect(
      send.mock.calls.filter(([, spaceId]) => spaceId === w.spaceId),
    ).toHaveLength(MAX_ATTEMPTS);
  });
});

describe("replies to an alert", () => {
  async function alerted() {
    const w = await linkedWorkspace({ balance: 20_000 });
    const sub = await w.subscription();
    await runAlertsTick(NOW, recorder().send);
    return { ...w, sub };
  }

  const intentOf = async (workspaceId: string, key: string) =>
    (await listRecurringPayments(workspaceId, NOW)).payments.find(
      (p) => p.key === key,
    );

  it("KEEP confirms the subscription and marks it Keep", async () => {
    const w = await alerted();

    const reply = await alertReplyTurn("keep", w.identity, NOW);

    expect(reply).toBe(ALERT_REPLIES.kept(w.sub.name));
    const payment = await intentOf(w.workspaceId, w.sub.key);
    expect(payment?.decision).toBe("confirmed");
    expect(payment?.userIntent).toBe("keep");
  });

  it("CANCEL confirms it and marks it Planning to cancel", async () => {
    const w = await alerted();

    const reply = await alertReplyTurn("Cancel", w.identity, NOW);

    expect(reply).toContain("Planning to cancel");
    expect(reply).toContain("can't cancel it for you");
    expect((await intentOf(w.workspaceId, w.sub.key))?.userIntent).toBe(
      "cancel",
    );
  });

  it("IGNORE dismisses the suggestion", async () => {
    const w = await alerted();

    expect(await alertReplyTurn("not mine", w.identity, NOW)).toBe(
      ALERT_REPLIES.ignored(w.sub.name),
    );
    expect((await intentOf(w.workspaceId, w.sub.key))?.decision).toBe(
      "dismissed",
    );
  });

  it("DETAILS gives a subscription's cost", async () => {
    const w = await alerted();

    expect(await alertReplyTurn("details", w.identity, NOW)).toBe(
      `${w.sub.name}: $15.49 a charge (monthly), about $15.49 a month and $185.88 a year. Reply KEEP, CANCEL or IGNORE.`,
    );
  });

  it("DETAILS gives a bill's amount, with the low-balance line", async () => {
    const w = await linkedWorkspace({ balance: 20_000 });
    const loan = await w.bill("2026-10-12");
    await runAlertsTick(NOW, recorder().send);

    const reply = await alertReplyTurn("DETAILS", w.identity, NOW);

    expect(reply).toBe(
      `${loan.name}: about $320.00 due tomorrow. That's an estimate from past payments. Your balance is $200.00, which is less than this payment.`,
    );
    expect(await alertReplyTurn("keep", w.identity, NOW)).toBe(
      ALERT_REPLIES.notForBills,
    );
  });

  it("has nothing to answer without a recent alert", async () => {
    const w = await linkedWorkspace();
    expect(await alertReplyTurn("keep", w.identity, NOW)).toBe(
      ALERT_REPLIES.nothingOpen,
    );

    const old = await alerted();
    const fourDaysLater = new Date(NOW.getTime() + 4 * 24 * 3600_000);
    expect(await alertReplyTurn("keep", old.identity, fourDaysLater)).toBe(
      ALERT_REPLIES.nothingOpen,
    );
  });

  it("is not a reply unless it is the whole text", async () => {
    const w = await alerted();
    expect(await alertReplyTurn("keep track of lunch", w.identity, NOW)).toBe(
      null,
    );
  });

  it("only acts on the replying phone's own alert", async () => {
    const mine = await alerted();
    const other = await linkedWorkspace();

    expect(await alertReplyTurn("keep", other.identity, NOW)).toBe(
      ALERT_REPLIES.nothingOpen,
    );
    expect((await intentOf(mine.workspaceId, mine.sub.key))?.decision).toBe(
      "candidate",
    );
    // An identity claiming another workspace is refused too.
    expect(
      await alertReplyTurn(
        "keep",
        { ...other.identity, identityId: mine.identity.identityId },
        NOW,
      ),
    ).toBe(ALERT_REPLIES.nothingOpen);
    const rows = await db
      .select()
      .from(proactiveMessage)
      .where(
        and(
          eq(proactiveMessage.workspaceId, mine.workspaceId),
          eq(proactiveMessage.status, "sent"),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});
