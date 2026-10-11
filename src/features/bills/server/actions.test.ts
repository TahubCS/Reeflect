import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { financialAccount } from "@/lib/db/schema";
import {
  fixtures,
  isNotFound,
  isRedirect,
} from "../../../../tests/support/db-fixtures";
import * as repository from "./repository";
import {
  createBillAction,
  updateBillAction,
  saveInvoiceAction,
  markPaidAction,
  linkPaymentAction,
  unlinkPaymentAction,
  confirmBillAction,
  billDispositionAction,
} from "./actions";
import { loadBills } from "./load";
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
const f = fixtures();
const empty = { errors: {} };
let ws: string,
  other: string,
  editor: string,
  viewer: string,
  accountId: string;
const ON = "2026-10-11";
const NOW = new Date("2026-10-11T16:00:00Z");
const form = (extra: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    accountId,
    name: "Electric",
    merchant: "electric",
    amountMode: "variable",
    every: "1",
    unit: "months",
    amount: "145",
    nextOn: ON,
    ...extra,
  }))
    data.set(key, value);
  return data;
};
async function thrown(operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("Expected control flow");
}
beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  ws = await f.newWorkspace({ [editor]: "editor", [viewer]: "viewer" });
  other = await f.newWorkspace();
  const [row] = await db
    .insert(financialAccount)
    .values({
      workspaceId: ws,
      nickname: "Cash",
      institutionName: "Synthetic",
      type: "checking",
      source: "synthetic",
    })
    .returning();
  accountId = row!.id;
});
beforeEach(() => {
  getSession.mockResolvedValue({ user: { id: editor } });
  vi.mocked(refresh).mockClear();
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => f.cleanUp());
describe("Bills boundaries", () => {
  it("validates forms without calling persistence and preserves invalid input", async () => {
    const spy = vi.spyOn(repository, "saveBill");
    expect(
      await createBillAction(ws, empty, form({ amount: "invalid" })),
    ).toMatchObject({
      errors: { amount: expect.any(String) },
      values: { amount: "invalid" },
    });
    expect(spy).not.toHaveBeenCalled();
    expect(
      await saveInvoiceAction(
        ws,
        accountId,
        "electric",
        ON,
        1,
        empty,
        form({ dueOn: "2026-02-30", invoiceAmount: "-1" }),
      ),
    ).toMatchObject({
      errors: { dueOn: expect.any(String), invoiceAmount: expect.any(String) },
    });
    expect(
      await linkPaymentAction(
        ws,
        accountId,
        "electric",
        ON,
        1,
        empty,
        form({ transactionId: crypto.randomUUID() }),
      ),
    ).toMatchObject({ errors: { confirmed: expect.any(String) } });
  });
  it("redirects only a successful creation and binds the workspace/account/payee on editing", async () => {
    const created = await thrown(
      createBillAction(ws, empty, form({ workspaceId: other })),
    );
    expect(isRedirect(created)).toBe(true);
    const saved = (await repository.readBills(ws, NOW)).bills[0]!;
    expect(
      await updateBillAction(
        ws,
        accountId,
        "electric",
        saved.detail!.revision,
        empty,
        form({
          accountId: crypto.randomUUID(),
          merchant: "forged",
          name: "Electricity",
          workspaceId: other,
        }),
      ),
    ).toMatchObject({ message: "Bill settings saved." });
    expect(
      (await repository.readBills(ws, NOW)).bills[0]!.payment,
    ).toMatchObject({ accountId, merchant: "electric", name: "Electricity" });
  });
  it.each([
    "duplicate",
    "stale",
    "invalid_payment",
    "allocated",
    "invalid_account",
    "limit",
  ] as const)("explains %s and does not refresh", async (result) => {
    vi.spyOn(repository, "saveBill").mockResolvedValue(result);
    expect(await createBillAction(ws, empty, form())).toMatchObject({
      errors: { form: expect.any(String) },
      values: { name: "Electric" },
    });
    expect(refresh).not.toHaveBeenCalled();
  });
  it("handles persistence failure, and lets genuine notFound escape its write handler", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const spy = vi
      .spyOn(repository, "saveBill")
      .mockRejectedValue(new Error("private database error"));
    expect(await createBillAction(ws, empty, form())).toMatchObject({
      errors: { form: "Could not save this change. Please try again." },
    });
    expect(log).toHaveBeenCalledWith("bills: write failed", {
      workspaceId: ws,
    });
    spy.mockResolvedValue("not_found");
    expect(isNotFound(await thrown(createBillAction(ws, empty, form())))).toBe(
      true,
    );
  });
  it("validates every bound control before accessing its repository", async () => {
    const calls = [
      () => updateBillAction(ws, "bad", "electric", 1, empty, form()),
      () => updateBillAction(ws, accountId, "electric", -1, empty, form()),
      () =>
        saveInvoiceAction(ws, accountId, "electric", "bad", 1, empty, form()),
      () =>
        markPaidAction(ws, accountId, "electric", ON, 1, "true", empty, form()),
      () =>
        unlinkPaymentAction(
          ws,
          accountId,
          "electric",
          ON,
          1,
          "bad",
          empty,
          form(),
        ),
      () =>
        billDispositionAction(ws, accountId, "electric", "bad", empty, form()),
    ];
    for (const operation of calls)
      expect(isNotFound(await thrown(operation()))).toBe(true);
  });
  it("refreshes successful payment controls with distinct manual and posted messages", async () => {
    vi.spyOn(repository, "markBillPaid").mockResolvedValue("ok");
    vi.spyOn(repository, "linkBillPayment").mockResolvedValue("ok");
    vi.spyOn(repository, "unlinkBillPayment").mockResolvedValue("ok");
    vi.spyOn(repository, "saveInvoice").mockResolvedValue("ok");
    expect(
      (
        await markPaidAction(
          ws,
          accountId,
          "electric",
          ON,
          1,
          true,
          empty,
          form(),
        )
      ).message,
    ).toContain("No transaction was created");
    expect(
      (
        await markPaidAction(
          ws,
          accountId,
          "electric",
          ON,
          1,
          false,
          empty,
          form(),
        )
      ).message,
    ).toContain("removed");
    expect(
      (
        await linkPaymentAction(
          ws,
          accountId,
          "electric",
          ON,
          1,
          empty,
          form({ transactionId: crypto.randomUUID(), confirmed: "on" }),
        )
      ).message,
    ).toBe("Payment linked.");
    expect(
      (
        await unlinkPaymentAction(
          ws,
          accountId,
          "electric",
          ON,
          1,
          crypto.randomUUID(),
          empty,
          form(),
        )
      ).message,
    ).toContain("unchanged");
    expect(
      (
        await saveInvoiceAction(
          ws,
          accountId,
          "electric",
          ON,
          1,
          empty,
          form({ dueOn: ON, invoiceAmount: "184" }),
        )
      ).message,
    ).toBe("Invoice saved.");
    expect(refresh).toHaveBeenCalledTimes(5);
  });
  it("loads viewer detail, rejects foreign accounts and invalid route targets, and propagates read failures", async () => {
    getSession.mockResolvedValue({ user: { id: viewer } });
    expect(await loadBills(ws, {}, NOW)).toMatchObject({
      workspaceId: ws,
      canEdit: false,
    });
    const data = await loadBills(
      ws,
      { accountId, merchant: "electric", cycle: ON },
      NOW,
    );
    expect(data.selected?.payment.merchant).toBe("electric");
    expect(data.candidates.rows).toEqual([]);
    for (const query of [
      { account: crypto.randomUUID() },
      { accountId: "bad" },
      { accountId, merchant: "absent" },
      { accountId, merchant: "electric", cycle: "2026-10-12" },
    ])
      expect(isNotFound(await thrown(loadBills(ws, query, NOW)))).toBe(true);
    vi.spyOn(repository, "readBills").mockRejectedValue(
      new Error("unavailable"),
    );
    await expect(loadBills(ws, {}, NOW)).rejects.toThrow("unavailable");
  });
  it("authorizes before malformed form validation and refuses viewer mutations", async () => {
    getSession.mockResolvedValue({ user: { id: viewer } });
    expect(
      isNotFound(await thrown(createBillAction(ws, empty, new FormData()))),
    ).toBe(true);
    getSession.mockResolvedValue(null);
    expect(
      isNotFound(
        await thrown(confirmBillAction(ws, "bad", "", empty, new FormData())),
      ),
    ).toBe(true);
  });
  it("keeps the stopped bill available and restores a manual schedule", async () => {
    expect(
      (
        await billDispositionAction(
          ws,
          accountId,
          "electric",
          "remove",
          empty,
          form(),
        )
      ).message,
    ).toContain("history");
    expect(
      (
        await billDispositionAction(
          ws,
          accountId,
          "electric",
          "restore",
          empty,
          form(),
        )
      ).message,
    ).toContain("restored");
    expect(
      isNotFound(
        await thrown(confirmBillAction(ws, accountId, "absent", empty, form())),
      ),
    ).toBe(true);
  });
  it("loads editor candidate pages and applies an owned account filter", async () => {
    expect(
      await loadBills(
        ws,
        { account: accountId, accountId, merchant: "electric" },
        NOW,
      ),
    ).toMatchObject({
      canEdit: true,
      query: { account: accountId },
      selected: expect.any(Object),
      cycle: expect.any(Object),
      candidates: { hasMore: false },
    });
    expect(
      await db
        .select()
        .from(financialAccount)
        .where(eq(financialAccount.workspaceId, other)),
    ).toEqual([]);
  });
});
