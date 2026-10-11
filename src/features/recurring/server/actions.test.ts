import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  fixtures,
  isNotFound,
  isRedirect,
} from "../../../../tests/support/db-fixtures";
import {
  confirmPaymentAction,
  paymentDispositionAction,
  paymentIntentAction,
  refreshPaymentsAction,
  savePaymentAction,
  suggestionCountAction,
  updatePaymentAction,
} from "./actions";
import * as repository from "./repository";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession: session }));
const f = fixtures();
let workspace: string;
let editor: string;
let viewer: string;
let stranger: string;
const accountId = crypto.randomUUID();
const EMPTY = { errors: {} };
function form(values: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({
    accountId,
    merchant: "city electric",
    name: "Electricity",
    kind: "bill",
    amountMode: "variable",
    unit: "months",
    every: "1",
    amount: "110",
    nextOn: "2026-11-01",
    ...values,
  }))
    result.set(key, value);
  return result;
}
async function thrown(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected redirect/notFound");
}
beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  stranger = await f.newUser();
  workspace = await f.newWorkspace({ [editor]: "editor", [viewer]: "viewer" });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => f.cleanUp());
const asEditor = () => session.mockResolvedValue({ user: { id: editor } });

describe("recurring entry points", () => {
  const actions = [
    () => refreshPaymentsAction(workspace, EMPTY, new FormData()),
    () => confirmPaymentAction(workspace, "bad", "", EMPTY, new FormData()),
    () => savePaymentAction(workspace, EMPTY, new FormData()),
    () => updatePaymentAction(workspace, "bad", "", EMPTY, new FormData()),
    () => paymentIntentAction(workspace, "bad", "", EMPTY, new FormData()),
    () => paymentDispositionAction(workspace, "bad", "", EMPTY, new FormData()),
  ];
  it.each(actions.map((call, i) => ({ call, i })))(
    "authorizes action $i before validation or writes",
    async ({ call }) => {
      for (const user of [null, viewer, stranger]) {
        session.mockResolvedValue(user ? { user: { id: user } } : null);
        expect(isNotFound(await thrown(call()))).toBe(true);
      }
    },
  );
  it("redirects only after an authorized refresh", async () => {
    asEditor();
    const spy = vi
      .spyOn(repository, "refreshRecurringSeries")
      .mockResolvedValue("ok");
    expect(
      isRedirect(
        await thrown(refreshPaymentsAction(workspace, EMPTY, new FormData())),
      ),
    ).toBe(true);
    expect(spy).toHaveBeenCalledWith(workspace);
  });
  it("confirms the server-bound target", async () => {
    asEditor();
    const spy = vi.spyOn(repository, "confirmPattern").mockResolvedValue("ok");
    expect(
      isRedirect(
        await thrown(
          confirmPaymentAction(
            workspace,
            accountId,
            "city electric",
            EMPTY,
            new FormData(),
          ),
        ),
      ),
    ).toBe(true);
    expect(spy).toHaveBeenCalledWith(workspace, accountId, "city electric");
  });
  it("validates manual input and retains rejected values", async () => {
    asEditor();
    const spy = vi.spyOn(repository, "savePayment").mockResolvedValue("ok");
    const bad = await savePaymentAction(
      workspace,
      EMPTY,
      form({ amount: "nonsense" }),
    );
    expect(bad).toMatchObject({
      errors: { amount: expect.any(String) },
      values: { amount: "nonsense" },
    });
    expect(spy).not.toHaveBeenCalled();
    expect(
      isRedirect(await thrown(savePaymentAction(workspace, EMPTY, form()))),
    ).toBe(true);
  });
  it("prevents an edit form from switching account or merchant identity", async () => {
    asEditor();
    const spy = vi.spyOn(repository, "savePayment").mockResolvedValue("ok");
    expect(
      isRedirect(
        await thrown(
          updatePaymentAction(
            workspace,
            accountId,
            "city electric",
            EMPTY,
            form({
              accountId: crypto.randomUUID(),
              merchant: "foreign merchant",
            }),
          ),
        ),
      ),
    ).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      workspace,
      expect.objectContaining({ accountId, merchant: "city electric" }),
      true,
    );
    expect(
      (
        await updatePaymentAction(
          workspace,
          accountId,
          "city electric",
          EMPTY,
          form({ every: "0" }),
        )
      ).errors.every,
    ).toBeDefined();
  });
  it.each(["none", "keep", "cancel"])(
    "saves the validated %s intent",
    async (intent) => {
      asEditor();
      const spy = vi
        .spyOn(repository, "setPaymentIntent")
        .mockResolvedValue("ok");
      expect(
        isRedirect(
          await thrown(
            paymentIntentAction(
              workspace,
              accountId,
              "city electric",
              EMPTY,
              form({ intent }),
            ),
          ),
        ),
      ).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        workspace,
        accountId,
        "city electric",
        intent,
      );
    },
  );
  it.each(["dismiss", "restore", "remove"])(
    "saves the validated %s disposition",
    async (disposition) => {
      asEditor();
      const spy = vi
        .spyOn(repository, "setPaymentDisposition")
        .mockResolvedValue("ok");
      expect(
        isRedirect(
          await thrown(
            paymentDispositionAction(
              workspace,
              accountId,
              "city electric",
              EMPTY,
              form({ disposition }),
            ),
          ),
        ),
      ).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        workspace,
        accountId,
        "city electric",
        disposition,
      );
    },
  );
  it("rejects malformed targets and choices for authorized callers", async () => {
    asEditor();
    expect(
      isNotFound(
        await thrown(
          confirmPaymentAction(
            workspace,
            "bad",
            "city electric",
            EMPTY,
            form(),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      (
        await paymentIntentAction(
          workspace,
          accountId,
          "city electric",
          EMPTY,
          form({ intent: "bad" }),
        )
      ).errors,
    ).not.toEqual({});
    expect(
      (
        await paymentDispositionAction(
          workspace,
          accountId,
          "city electric",
          EMPTY,
          form({ disposition: "bad" }),
        )
      ).errors,
    ).not.toEqual({});
  });
  it.each(["limit", "duplicate", "not_subscription"] as const)(
    "returns a safe %s error",
    async (result) => {
      asEditor();
      vi.spyOn(repository, "savePayment").mockResolvedValue(result);
      expect(
        (await savePaymentAction(workspace, EMPTY, form())).errors.form,
      ).toBeTruthy();
    },
  );
  it("treats missing objects as not found", async () => {
    asEditor();
    vi.spyOn(repository, "savePayment").mockResolvedValue("not_found");
    expect(
      isNotFound(await thrown(savePaymentAction(workspace, EMPTY, form()))),
    ).toBe(true);
  });
  it("keeps failed SQL writes retryable without exposing database errors", async () => {
    asEditor();
    vi.spyOn(repository, "savePayment").mockRejectedValue(
      new Error("private query details"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await savePaymentAction(workspace, EMPTY, form())).toMatchObject({
      errors: { form: "Could not save this change. Please try again." },
      values: { name: "Electricity" },
    });
    expect(log).toHaveBeenCalledWith("recurring: write failed", {
      workspaceId: workspace,
    });
  });
});

describe("suggestionCountAction", () => {
  it("gives a member the number of suggestions waiting", async () => {
    session.mockResolvedValue({ user: { id: viewer } });
    const list = vi
      .spyOn(repository, "listRecurringPayments")
      .mockResolvedValue({
        summary: { candidates: 3 },
      } as Awaited<ReturnType<typeof repository.listRecurringPayments>>);
    expect(await suggestionCountAction(workspace)).toBe(3);
    expect(list).toHaveBeenCalledWith(workspace);
  });

  it("shows no number to a stranger or for a bad id, and reads nothing", async () => {
    const list = vi.spyOn(repository, "listRecurringPayments");
    session.mockResolvedValue({ user: { id: stranger } });
    expect(await suggestionCountAction(workspace)).toBe(0);
    session.mockResolvedValue({ user: { id: editor } });
    expect(await suggestionCountAction("../x")).toBe(0);
    session.mockResolvedValue(null);
    expect(await suggestionCountAction(workspace)).toBe(0);
    expect(list).not.toHaveBeenCalled();
  });

  it("counts real suggestions from the ledger", async () => {
    session.mockResolvedValue({ user: { id: viewer } });
    expect(await suggestionCountAction(workspace)).toBe(
      (await repository.listRecurringPayments(workspace)).summary.candidates,
    );
  });
});
